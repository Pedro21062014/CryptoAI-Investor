# Task: CryptoAI Investor v1.0.4 Feature Implementation

## Summary of Changes

### 1. Custom AI Model Selection for ALL Providers (HTML)
**File**: `/home/z/CryptoAI-Investor/src/index.html`

For each of the 6 AI providers (deepseek, openai, google, nvidia, claude, openrouter):
- Added `onchange="handleModelChange('provider')"` to the model `<select>` element
- Added `<option value="custom">Personalizado...</option>` as the last option
- Added `<input type="text" id="provider-model-custom" class="custom-model-input" placeholder="nome-do-modelo" style="display:none; margin-top:8px;">` below the select

Also added `o3-mini` to OpenAI options and `gemini-2.0-flash` to Google options as specified.

The `custom` AI provider was NOT modified since it already uses a text input for model name.

### 2. handleModelChange Function & Updated getAIConfig (JS)
**File**: `/home/z/CryptoAI-Investor/src/js/renderer.js`

- Added `handleModelChange(provider)` function that shows/hides the custom model input based on select value
- Modified `getAIConfig(provider)` to check if model value is 'custom' and use the custom input value instead

### 3. Enhanced Cache/Storage System (JS)
**File**: `/home/z/CryptoAI-Investor/src/js/renderer.js`

- **saveConfig()**: Now also saves `trades`, `aiMetrics`, and `modelSelections` (model dropdown + custom input per provider)
- **loadSavedConfig()**: Now restores trades (via `updateTradesTable()`), aiMetrics (via `updateAIMetricsUI()`), and model selections (restoring dropdown values and showing/hiding custom inputs)
- **updateAIMetricsUI()**: New standalone function to update AI metrics UI elements
- **updateAIMetrics()**: Now calls `updateAIMetricsUI()` and `saveConfig()` after updating metrics
- **executeTrade()**: Added `saveConfig()` call after pushing trade to state.trades
- **executeAITrade()**: Added `saveConfig()` call after pushing trade to state.trades

### 4. CSS for Custom Model Input
**File**: `/home/z/CryptoAI-Investor/src/css/main.css`

Added `.custom-model-input` styles at the end of the file:
- Styled with bg-input, accent-cyan border, monospace font
- Focus state with cyan box-shadow
- Placeholder with muted color and primary font
- fadeIn animation for smooth appearance

### 5. Version Update
**File**: `/home/z/CryptoAI-Investor/package.json`

Changed version from `1.0.3` to `1.0.4`
