# iProjectX documents

Print-ready HTML is the source. Generated PDFs also copy to `public/docs/` so the signed-in app can download them from **About**.

## User manual

| File | Use |
| --- | --- |
| `user-manual/iProjectX-User-Manual.html` | End-to-end operating manual (10 A4 pages). |
| `user-manual/pdf/iProjectX-User-Manual.pdf` | Same, for email / print. |

Walks sign-in, roles, building blocks, first-week admin, Plan / Demand / Actuals, gates and RAID, executive views, screen atlas, trust, and glossary.

## Sales pack

| File | Who | Use |
| --- | --- | --- |
| `sales/pdf/iProjectX-Platform-Pitch.pdf` | Sponsor / PMO / exec | 12-page A4 capabilities pitch (features in detail). |
| `sales/pdf/iProjectX-Sales-Brochure.pdf` | Anyone in the room | 2-page A4 brochure. |
| `sales/pdf/iProjectX-One-Pager.pdf` | Anyone who missed the meeting | 1-page leave-behind. |
| `sales/pdf/iProjectX-Sales-Pitch.pdf` | Short room | 10-slide 16:9 pitch. |
| `sales/pdf/iProjectX-Security-Trust.pdf` | CISO / procurement | Controls. No fake certificates. |
| `sales/pdf/iProjectX-Seller-Playbook.pdf` | iProjectX sellers only | Talk track. **Do not leave with the buyer.** |

Story: registers record the past; intelligence surfaces the **next decision**. CTA is Expression of Interest. No invented logos, quotes, or ROI.

## Reprint

```bash
npm run build:docs-pdfs
```

Requires Google Chrome or Chromium. Optional: `CHROME_PATH=/path/to/chrome`.
