# Optional creator support

The notebook remains free. The support action opens a translated PT/ES/EN dialog; it does not unlock features, collect card information, create a subscription, or record a successful payment. Copying Pix only copies the code. An international payment page opens separately so the notebook stays open.

## Activation

Await the owner's actual receiving details and explicit choice to publish them. No real or example recipient is hardcoded. With neither valid method configured, all support entry points are hidden.

- `NEXT_PUBLIC_SUPPORT_PIX_CODE`: the bank-generated Pix Copia e Cola payload. Prefer a reusable static code without a fixed amount, using a random Pix key rather than a personal identifier. Keep its exact content; do not invent a receiving account or modify the amount. Structural and CRC validation reject a damaged code but cannot verify ownership, availability, or bank-side expiry. Confirm the owner and intended amount behavior before publishing; the payer confirms the recipient in their bank.
- `NEXT_PUBLIC_SUPPORT_URL`: the owner's public Ko-fi page, PayPal.Me link, PayPal donation/payment link, or Stripe Payment Link. Only the exact supported HTTPS provider domains are accepted. Validation is not proof of account ownership; verify the page belongs to the creator before activation. The receiving account and provider availability must already be configured by its owner.

Both values are intentionally public browser configuration. Never put provider API keys, passwords, service-role keys, payment details of supporters, or other authentication secrets in these variables. Next.js inlines these values at build time; activation requires a new deployment. One configured method can be enabled independently if the owner chooses that rollout.

## Verification

Run the support configuration and dialog tests plus typecheck. Verify desktop/mobile layout, keyboard opening/Escape/focus return, PT/ES/EN, selectable Pix text, clipboard failure feedback, and the exact international destination/new-tab behavior. Do not make a real payment as a test. Remove any local-only preview fixture before deployment.

This is a voluntary support link, not a billing integration or charitable tax receipt. Fees and available payment methods are handled by the chosen provider.

Sources reviewed 2026-10-01:
- [Banco Central Pix initiation manual](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf), BR Code CRC-16 (polynomial 0x1021, initial value 0xFFFF).
- [Ko-fi payment flow](https://help.ko-fi.com/hc/en-us/articles/115003980093-How-do-I-get-paid), connected PayPal/Stripe receiving accounts.
- [Vercel fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), asking for donations is excluded from commercial usage.
