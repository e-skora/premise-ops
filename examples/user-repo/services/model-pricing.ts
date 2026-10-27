// A stand-in for someone else's repo. CI runs `scan --import` and `check`
// with PREMISE_WORKSPACE_ROOT pointed here, the same way the README's
// copy-paste workflow does, and reads the saved OpenRouter copy instead of
// the internet. The saved price is 0.000002 USD per input token, so this
// premise really holds and the check must exit 0.
// @premise title: Self-host the model only while the API costs more than $1 per 1M input tokens
// @premise metric: sonnet_input_price_per_token_usd > 0.000001 USD (margin: 0.1)
// @premise probe: HTTP_JSON_PATH | https://openrouter.ai/api/v1/models
// @premise jsonPath: $.data[?(@.id=="anthropic/claude-sonnet-5.5")].pricing.prompt
// @premise blastRadius: Retire the self-hosted inference cluster and route calls to the API

export const selfHostedInference = true;
