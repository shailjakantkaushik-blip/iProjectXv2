# iProjectX sales pitch PDF pack

Print-ready pack for enterprise conversations. Source is HTML in this folder. Generated PDFs live in `pdf/`.

## What to take into the room

| File | Who | Use |
| --- | --- | --- |
| `pdf/iProjectX-Sales-Pitch.pdf` | Sponsor / PMO / exec | 10-slide 16:9 pitch. One idea per slide. |
| `pdf/iProjectX-One-Pager.pdf` | Anyone who missed the meeting | A4 leave-behind. |
| `pdf/iProjectX-Security-Trust.pdf` | CISO / procurement | Controls, AI, BYOD. No fake certificates. |
| `pdf/iProjectX-Seller-Playbook.pdf` | iProjectX sellers only | Talk track, discovery, demo path, objections, close. **Do not leave this with the buyer.** |

## Story the pack sells

Registers record the past. Intelligence surfaces the **next decision** before the board pack is late.

**See. Explain. Govern. Trust.**

- Calculated Project Health (8 dimensions). RAG: Green ≥ 80, Amber 65–79, Red &lt; 65.
- Portfolio Pulse (6 areas) and an executive cockpit — not a status slideshow.
- Stage gates and RAID on the same spine as Agile and Waterfall.
- MFA for every user. Optional SSO, IP allowlists, BYOD, white-label. In-house AI by default.

CTA: **Expression of Interest** · [www.iprojectx.com](https://www.iprojectx.com) · [www.iprojectx.com.au](https://www.iprojectx.com.au)

## Reprint

```bash
node scripts/generate-sales-pdf-pack.mjs
```

Requires Google Chrome or Chromium. Optional: `CHROME_PATH=/path/to/chrome`.

## Rules for sellers

- Do not invent customer logos, quotes, or ROI percentages.
- Do not claim SOC 2 or ISO 27001 certification. Say readiness and show the trust sheet.
- Do not demo a neighbour’s portfolio. Scope is the product.
