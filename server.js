'use strict';
/**
 * GEL Inbound Shipments Board
 * Port: INBOUND_PORT (default 3005)
 *
 * Routes:
 *   GET  /                       → serve UI
 *   GET  /api/inbound-shipments  → find active inbound shipments (±30-day window, no actual arrival)
 *   GET  /api/fm/status          → FM connection test
 *
 * FM LAYOUT: GatesInboundShipmentsAPI
 *
 * FIND LOGIC:
 *   ActualArrivalDate = "=" (blank — shipment has NOT arrived yet)
 *   ExpArrivalDate    = ">= today-30 and <= today+30"
 *
 * ⚠️  IMPORTANT: ActualArrivalDate MUST be present on the GatesInboundShipmentsAPI
 *     layout (even as a hidden field) for the Data API find to work.
 *
 * RELATED FIELDS (placed directly on layout, not in a portal):
 *   InBoundCompanies::CompanyName  → Carrier
 *   InboundVendors::CompanyName    → Vendor / Supplier
 *   InBoundFC::CompanyName         → Freight / Logistics Company
 */

require('dotenv').config();

const path    = require('path');
const express = require('express');
const { createGELClient } = require('./lib/fm-client');

const PORT   = process.env.INBOUND_PORT || 3005;
const LAYOUT = 'GatesInboundShipmentsAPI';

const app = express();
app.use(express.json());
// In production, Vite builds to dist/. In dev, Vite's own server handles the UI.
app.use(express.static(path.join(__dirname, 'dist')));

// ─────────────────────────────────────────────────────────────
// Helper: format a JS Date as M/D/YYYY for FileMaker find syntax
// ─────────────────────────────────────────────────────────────
function fmDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────
// Helper: FM session wrapper
// ─────────────────────────────────────────────────────────────
async function withFM(res, fn) {
  const fm = createGELClient();
  try {
    await fm.login();
    const result = await fn(fm);
    await fm.logout();
    return result;
  } catch (err) {
    await fm.logout().catch(() => {});
    // Log full FM error detail so it appears in PM2 logs
    const fmDetail = err.response?.data;
    console.error('[FM ERROR]', err.message, fmDetail ? JSON.stringify(fmDetail) : '');
    res.status(500).json({
      error:    err.message,
      fmDetail: fmDetail ?? null,
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/inbound-shipments
// ─────────────────────────────────────────────────────────────
app.get('/api/inbound-shipments', async (req, res) => {
  const result = await withFM(res, async (fm) => {
    const now      = new Date();
    const pastDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);  // all overdue up to 30 days back
    const next72h  = new Date(now.getTime() + 3  * 24 * 60 * 60 * 1000);  // next 72 hours
    const dateRange = `${fmDate(pastDays)}...${fmDate(next72h)}`;

    const records = await fm.findRecords(
      LAYOUT,
      {
        'ActualArrivalDate': '=',       // blank = not yet arrived
        'ExpArrivalDate':    dateRange, // within ±30 days
      },
      {
        limit: 200,
        sort:  [{ fieldName: 'ExpArrivalDate', sortOrder: 'ascend' }],
      }
    );

    return {
      count:   records.length,
      asOf:    new Date().toISOString(),
      window:  { from: fmDate(pastDays), to: fmDate(next72h) },
      records: records.map(r => ({
        recordId:     r.recordId,
        expArrival:   r.fieldData['ExpArrivalDate']                || '',
        ticketNumber: r.fieldData['InboundTicket Number']          || '',
        gelPO:        r.fieldData['Gel PO#']                       || '',
        billOfLading: r.fieldData['BillOfLading']                  || '',
        carrier:      r.fieldData['InBoundCompanies::CompanyName'] || '',
        vendor:       r.fieldData['InboundVendors::CompanyName']   || '',
        logisticsco:  r.fieldData['InBoundFC::CompanyName']        || '',
      })),
    };
  });

  if (result !== null) res.json(result);
});

// ─────────────────────────────────────────────────────────────
// GET /api/fm/status
// ─────────────────────────────────────────────────────────────
app.get('/api/fm/status', async (_req, res) => {
  const fm = createGELClient();
  try {
    await fm.login();
    await fm.logout();
    res.json({ connected: true, host: process.env.FM_HOST, database: process.env.FM_SIDEKICK_DB });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SPA fallback — serves the Vite-built index.html for any unknown route
// ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  GEL Inbound Shipments  →  http://localhost:${PORT}\n`);
});
