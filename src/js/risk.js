module.exports = {
  calculate(config, portfolio, analysis) {
    const maxRiskLevel = config.maxRiskLevel || 'MEDIUM';
    const maxLoss = config.maxLoss || 5;
    const maxPositionSize = config.maxPositionSize || 10;

    const riskLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, EXTREME: 4 };
    const analysisRisk = riskLevels[analysis.risk_level] || 2;
    const maxRisk = riskLevels[maxRiskLevel] || 2;

    const riskAssessment = {
      allowed: analysisRisk <= maxRisk,
      riskScore: this.calculateRiskScore(portfolio, analysis),
      warnings: [],
      recommendations: [],
      positionSizing: {}
    };

    // Check if risk exceeds limits
    if (!riskAssessment.allowed) {
      riskAssessment.warnings.push(`AI analysis risk level (${analysis.risk_level}) exceeds your maximum (${maxRiskLevel})`);
    }

    // Check max loss
    if (portfolio.totalValue > 0) {
      const potentialLoss = portfolio.totalValue * (maxLoss / 100);
      riskAssessment.maxLossAmount = potentialLoss;
      riskAssessment.maxLossPercent = maxLoss;

      if (analysis.stop_loss && analysis.entry_price) {
        const lossPercent = Math.abs((analysis.stop_loss - analysis.entry_price) / analysis.entry_price * 100);
        if (lossPercent > maxLoss) {
          riskAssessment.warnings.push(`Potential loss (${lossPercent.toFixed(2)}%) exceeds maximum allowed (${maxLoss}%)`);
          riskAssessment.recommendations.push('Adjust stop loss to stay within maximum loss limits');
        }
      }
    }

    // Position sizing based on risk
    if (portfolio.totalValue > 0) {
      const riskPerTrade = maxLoss / 100;
      const maxPosition = portfolio.totalValue * (maxPositionSize / 100);
      const kellySize = this.kellyCriterion(analysis.confidence || 50);

      riskAssessment.positionSizing = {
        conservative: portfolio.totalValue * (riskPerTrade * 0.5),
        moderate: portfolio.totalValue * riskPerTrade,
        aggressive: portfolio.totalValue * (riskPerTrade * 1.5),
        kellyCriterion: portfolio.totalValue * kellySize,
        maximum: maxPosition
      };
    }

    // Portfolio diversification check
    if (portfolio.positions && portfolio.positions.length > 0) {
      const totalInvested = portfolio.positions.reduce((sum, p) => sum + (p.value || 0), 0);
      const largestPosition = Math.max(...portfolio.positions.map(p => p.value || 0));
      if (totalInvested > 0 && largestPosition / totalInvested > 0.3) {
        riskAssessment.warnings.push('Portfolio is over-concentrated. Largest position exceeds 30% of portfolio.');
        riskAssessment.recommendations.push('Consider diversifying to reduce concentration risk');
      }
    }

    // Volatility assessment
    if (analysis.confidence) {
      if (analysis.confidence < 40) {
        riskAssessment.warnings.push('Low confidence score indicates high uncertainty');
        riskAssessment.recommendations.push('Consider waiting for clearer market signals');
      }
      if (analysis.confidence > 80) {
        riskAssessment.recommendations.push('High confidence - may consider larger position within risk limits');
      }
    }

    return riskAssessment;
  },

  validateTrade(config, trade, portfolio) {
    const maxRiskLevel = config.maxRiskLevel || 'MEDIUM';
    const maxLoss = config.maxLoss || 5;
    const maxPositionSize = config.maxPositionSize || 10;

    // Binance commission: 0.2% on buy + 0.2% on sell = 0.4% total round-trip
    const BINANCE_COMMISSION_RATE = 0.002;
    const BINANCE_ROUND_TRIP_COMMISSION = BINANCE_COMMISSION_RATE * 2; // 0.4%
    const isBinance = String(config.exchange || '').toLowerCase() === 'binance';

    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      adjustedTrade: { ...trade }
    };

    // Check position size limit
    if (portfolio.totalValue > 0) {
      const positionPercent = (trade.quantity * (trade.price || 0)) / portfolio.totalValue * 100;
      if (positionPercent > maxPositionSize) {
        const adjustedQty = (portfolio.totalValue * maxPositionSize / 100) / (trade.price || 1);
        validation.warnings.push(`Position size (${positionPercent.toFixed(2)}%) exceeds max (${maxPositionSize}%). Adjusted to ${maxPositionSize}%.`);
        validation.adjustedTrade.quantity = adjustedQty;
      }
    }

    // Binance: validar que o notional da ordem cobre venda mínima $5 + comissão
    if (isBinance) {
      const notional = trade.quantity * (trade.price || 0);
      const BINANCE_SELL_MIN = 5;
      const minBuyNotional = BINANCE_SELL_MIN / Math.pow(1 - BINANCE_COMMISSION_RATE, 2); // ~$5.02
      if (notional > 0 && notional < minBuyNotional) {
        validation.valid = false;
        validation.errors.push(`Binance: ordem de ${notional.toFixed(2)} USDT abaixo do mínimo efetivo ${minBuyNotional.toFixed(2)} USDT (venda mínima $5 + 0.2% comissão compra/venda)`);
      }
      // Avisar sobre custo total de round-trip (comissão compra + venda)
      if (notional > 0) {
        const roundTripCost = notional * BINANCE_ROUND_TRIP_COMMISSION;
        validation.warnings.push(`Binance: custo estimado de comissão (compra+venda): ${roundTripCost.toFixed(4)} USDT (0.4% de ${notional.toFixed(2)} USDT)`);
      }
    }

    // Check max loss (including commission cost for Binance)
    if (trade.stopLoss && trade.price) {
      let lossPercent = Math.abs((trade.stopLoss - trade.price) / trade.price * 100);
      // Para Binance, somar o custo de round-trip commission na perda potencial
      if (isBinance) {
        lossPercent += BINANCE_ROUND_TRIP_COMMISSION * 100; // +0.4%
      }
      if (lossPercent > maxLoss) {
        const adjustedStop = trade.side === 'BUY'
          ? trade.price * (1 - maxLoss / 100)
          : trade.price * (1 + maxLoss / 100);
        validation.warnings.push(`Stop loss + comissões (${lossPercent.toFixed(2)}%) excede máximo (${maxLoss}%). Stop loss ajustado.`);
        validation.adjustedTrade.stopLoss = adjustedStop;
      }
    }

    // Check daily trade limit
    if (config.maxDailyTrades && portfolio.todayTrades >= config.maxDailyTrades) {
      validation.valid = false;
      validation.errors.push(`Daily trade limit (${config.maxDailyTrades}) reached.`);
    }

    // Check drawdown
    if (portfolio.currentDrawdown && config.maxDrawdown) {
      if (portfolio.currentDrawdown > config.maxDrawdown) {
        validation.valid = false;
        validation.errors.push(`Current drawdown (${portfolio.currentDrawdown.toFixed(2)}%) exceeds maximum (${config.maxDrawdown}%). Trading paused.`);
      }
    }

    return validation;
  },

  calculateRiskScore(portfolio, analysis) {
    let score = 50;

    // Adjust based on confidence
    if (analysis.confidence) {
      score += (analysis.confidence - 50) * 0.3;
    }

    // Adjust based on sentiment
    if (analysis.sentiment === 'bullish') score -= 10;
    if (analysis.sentiment === 'bearish') score += 10;

    // Adjust based on risk level
    const riskLevels = { LOW: -15, MEDIUM: 0, HIGH: 15, EXTREME: 30 };
    score += riskLevels[analysis.risk_level] || 0;

    return Math.max(0, Math.min(100, score));
  },

  kellyCriterion(confidence) {
    const winProb = confidence / 100;
    const lossProb = 1 - winProb;
    const winRatio = 2; // Assume 2:1 reward/risk
    const kelly = (winProb * winRatio - lossProb) / winRatio;
    return Math.max(0, Math.min(0.25, kelly)); // Cap at 25% for safety
  }
};
