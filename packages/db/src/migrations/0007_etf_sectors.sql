CREATE TABLE IF NOT EXISTS etf_sectors (
  isin        TEXT PRIMARY KEY,
  ticker      TEXT NOT NULL DEFAULT '',
  is_bond     INTEGER NOT NULL DEFAULT 0,
  sectors     TEXT NOT NULL DEFAULT '{}',
  source      TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
INSERT OR IGNORE INTO etf_sectors VALUES
  ('IE00B3RBWM25','VWRL',0,'{"Information Technology":29.7,"Financials":14.5,"Consumer Discretionary":10.8,"Industrials":10.3,"Healthcare":8.4,"Communication Services":7.0,"Consumer Staples":6.7,"Energy":5.1,"Real Estate":2.9,"Materials":2.7,"Utilities":2.0}','seed','2026-01-01T00:00:00Z'),
  ('IE00BFNM3J75','WSML',0,'{"Industrials":23.0,"Information Technology":18.0,"Consumer Discretionary":14.0,"Financials":11.0,"Healthcare":9.0,"Real Estate":7.0,"Materials":7.0,"Consumer Staples":4.0,"Energy":3.0,"Communication Services":2.0,"Utilities":2.0}','seed','2026-01-01T00:00:00Z'),
  ('IE00B3XXRP09','VUSA',0,'{"Information Technology":32.0,"Financials":13.0,"Healthcare":12.0,"Consumer Discretionary":11.0,"Communication Services":9.0,"Industrials":8.0,"Consumer Staples":6.0,"Energy":4.0,"Materials":2.0,"Real Estate":2.0,"Utilities":1.0}','seed','2026-01-01T00:00:00Z'),
  ('IE0032077012','EQQQ',0,'{"Information Technology":48.0,"Communication Services":17.0,"Consumer Discretionary":15.0,"Healthcare":7.0,"Industrials":5.0,"Consumer Staples":4.0,"Financials":2.0,"Materials":1.0,"Utilities":1.0}','seed','2026-01-01T00:00:00Z'),
  ('IE00B14X4T88','IAEX',0,'{"Financials":30.0,"Information Technology":20.0,"Consumer Discretionary":15.0,"Industrials":12.0,"Consumer Staples":8.0,"Energy":6.0,"Materials":5.0,"Healthcare":3.0,"Communication Services":1.0}','seed','2026-01-01T00:00:00Z'),
  ('IE00B3F81S21','VAGB',1,'{}','seed','2026-01-01T00:00:00Z');
