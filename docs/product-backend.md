# Product model and barcode lookup backend

This app is currently a static PWA, so real product and price providers must be connected through a backend service before production use. The frontend intentionally marks catalog and price matches as `DATI DIMOSTRATIVI` until authorized live providers are configured.

## Product model

The backend Product table or collection should use these fields:

| Field | Notes |
| --- | --- |
| `id` | Stable unique product identifier. |
| `barcode` | Optional EAN/UPC/Code 128 value. Add a unique sparse index so duplicate non-empty barcodes cannot be saved. |
| `barcodeType` | `EAN-13`, `EAN-8`, `UPC-A`, `UPC-E`, or `Code 128` when available. |
| `name` | User-facing product name. |
| `normalizedName` | Search-optimized name without accents/case differences. |
| `brand` | Product brand when available. |
| `category` | Product category for shopping-list sorting. |
| `imageUrl` | Authorized image URL, never a camera frame from the user's device. |
| `packageSize` | Numeric size or count. |
| `packageUnit` | Unit such as `g`, `kg`, `ml`, `l`, or `pz`. |
| `description` | Authorized product description. |
| `source` | Internal database, official API, authorized catalog, or configured external service. |
| `createdAt` | Creation timestamp. |
| `updatedAt` | Last update timestamp. |

## Lookup flow

1. Validate the barcode format on the backend.
2. Check the internal Product store by the unique `barcode` index before creating anything new.
3. Query only authorized providers from server-side adapters; never expose API keys in the frontend.
4. Normalize provider data into the Product model.
5. Cache successful and failed lookups with a last-updated timestamp.
6. Save user-completed unknown products only after checking again for an existing barcode.
7. Return clear errors for missing providers, rate limits, invalid barcodes, and unavailable price data.

## Price search flow

After a product is identified, the backend should use the user's consented approximate location to search within 10 km, then 20 km, 30 km, and 50 km. Results should compare normal price, promotional price, loyalty-card price, package format, unit price, requested quantity, availability, distance, and offer validity.
