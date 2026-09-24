// Reference universe: the symbol master the screener and search work over.
//
// This is *reference* data (name, exchange, sector) — not market data. Prices,
// fundamentals and everything else are fetched live from the data provider and
// are never hardcoded. Replace this list with an exchange-published symbol
// master (NSE/BSE bhavcopy) when you have a licensed feed; the shape is the
// same and nothing downstream changes.

export type UniverseEntry = {
  symbol: string; // provider symbol
  display: string;
  name: string;
  exchange: "NSE" | "GLOBAL";
  sector: string;
  sectorKey: string; // matches SECTOR_INDICES keys where a sector index exists
};

function nse(display: string, name: string, sector: string, sectorKey: string): UniverseEntry {
  return { symbol: `${display}.NS`, display, name, exchange: "NSE", sector, sectorKey };
}
function us(display: string, name: string, sector: string, sectorKey: string): UniverseEntry {
  return { symbol: display, display, name, exchange: "GLOBAL", sector, sectorKey };
}

export const UNIVERSE: UniverseEntry[] = [
  // ── Information Technology ──
  nse("TCS", "Tata Consultancy Services", "Information Technology", "IT"),
  nse("INFY", "Infosys", "Information Technology", "IT"),
  nse("WIPRO", "Wipro", "Information Technology", "IT"),
  nse("HCLTECH", "HCL Technologies", "Information Technology", "IT"),
  nse("TECHM", "Tech Mahindra", "Information Technology", "IT"),
  nse("LTIM", "LTIMindtree", "Information Technology", "IT"),
  nse("PERSISTENT", "Persistent Systems", "Information Technology", "IT"),
  nse("COFORGE", "Coforge", "Information Technology", "IT"),
  nse("MPHASIS", "Mphasis", "Information Technology", "IT"),
  nse("OFSS", "Oracle Financial Services Software", "Information Technology", "IT"),

  // ── Banking & Financial Services ──
  nse("HDFCBANK", "HDFC Bank", "Banking", "BANK"),
  nse("ICICIBANK", "ICICI Bank", "Banking", "BANK"),
  nse("SBIN", "State Bank of India", "Banking", "PSUBANK"),
  nse("KOTAKBANK", "Kotak Mahindra Bank", "Banking", "BANK"),
  nse("AXISBANK", "Axis Bank", "Banking", "BANK"),
  nse("INDUSINDBK", "IndusInd Bank", "Banking", "BANK"),
  nse("BANKBARODA", "Bank of Baroda", "Banking", "PSUBANK"),
  nse("PNB", "Punjab National Bank", "Banking", "PSUBANK"),
  nse("CANBK", "Canara Bank", "Banking", "PSUBANK"),
  nse("IDFCFIRSTB", "IDFC First Bank", "Banking", "BANK"),
  nse("FEDERALBNK", "Federal Bank", "Banking", "BANK"),
  nse("BAJFINANCE", "Bajaj Finance", "Financial Services", "FIN"),
  nse("BAJAJFINSV", "Bajaj Finserv", "Financial Services", "FIN"),
  nse("SBILIFE", "SBI Life Insurance", "Financial Services", "FIN"),
  nse("HDFCLIFE", "HDFC Life Insurance", "Financial Services", "FIN"),
  nse("ICICIGI", "ICICI Lombard General Insurance", "Financial Services", "FIN"),
  nse("CHOLAFIN", "Cholamandalam Investment", "Financial Services", "FIN"),
  nse("MUTHOOTFIN", "Muthoot Finance", "Financial Services", "FIN"),
  nse("SHRIRAMFIN", "Shriram Finance", "Financial Services", "FIN"),
  nse("LICI", "Life Insurance Corporation of India", "Financial Services", "FIN"),
  nse("PFC", "Power Finance Corporation", "Financial Services", "FIN"),
  nse("RECLTD", "REC Limited", "Financial Services", "FIN"),
  nse("HDFCAMC", "HDFC Asset Management", "Financial Services", "FIN"),

  // ── Energy & Power ──
  nse("RELIANCE", "Reliance Industries", "Energy", "ENERGY"),
  nse("ONGC", "Oil and Natural Gas Corporation", "Energy", "ENERGY"),
  nse("IOC", "Indian Oil Corporation", "Energy", "ENERGY"),
  nse("BPCL", "Bharat Petroleum", "Energy", "ENERGY"),
  nse("HINDPETRO", "Hindustan Petroleum", "Energy", "ENERGY"),
  nse("GAIL", "GAIL India", "Energy", "ENERGY"),
  nse("NTPC", "NTPC", "Power", "ENERGY"),
  nse("POWERGRID", "Power Grid Corporation", "Power", "ENERGY"),
  nse("TATAPOWER", "Tata Power", "Power", "ENERGY"),
  nse("ADANIGREEN", "Adani Green Energy", "Power", "ENERGY"),
  nse("ADANIPOWER", "Adani Power", "Power", "ENERGY"),
  nse("SUZLON", "Suzlon Energy", "Power", "ENERGY"),
  nse("NHPC", "NHPC", "Power", "ENERGY"),

  // ── Automobiles ──
  nse("MARUTI", "Maruti Suzuki India", "Automobile", "AUTO"),
  // Tata Motors demerged into two separately-listed companies (effective
  // 2025); the old TATAMOTORS.NS ticker no longer resolves on the live feed
  // (Yahoo returns "symbol may be delisted") — verified directly before
  // making this change. Both successor tickers below were checked against
  // the real feed and return live quotes.
  nse("TMCV", "Tata Motors Limited (Commercial Vehicles)", "Automobile", "AUTO"),
  nse("TMPV", "Tata Motors Passenger Vehicles", "Automobile", "AUTO"),
  nse("M&M", "Mahindra and Mahindra", "Automobile", "AUTO"),
  nse("BAJAJ-AUTO", "Bajaj Auto", "Automobile", "AUTO"),
  nse("HEROMOTOCO", "Hero MotoCorp", "Automobile", "AUTO"),
  nse("EICHERMOT", "Eicher Motors", "Automobile", "AUTO"),
  nse("TVSMOTOR", "TVS Motor Company", "Automobile", "AUTO"),
  nse("ASHOKLEY", "Ashok Leyland", "Automobile", "AUTO"),
  nse("BOSCHLTD", "Bosch India", "Auto Components", "AUTO"),
  nse("MOTHERSON", "Samvardhana Motherson International", "Auto Components", "AUTO"),

  // ── Pharma & Healthcare ──
  nse("SUNPHARMA", "Sun Pharmaceutical Industries", "Pharmaceuticals", "PHARMA"),
  nse("DRREDDY", "Dr Reddys Laboratories", "Pharmaceuticals", "PHARMA"),
  nse("CIPLA", "Cipla", "Pharmaceuticals", "PHARMA"),
  nse("DIVISLAB", "Divis Laboratories", "Pharmaceuticals", "PHARMA"),
  nse("LUPIN", "Lupin", "Pharmaceuticals", "PHARMA"),
  nse("AUROPHARMA", "Aurobindo Pharma", "Pharmaceuticals", "PHARMA"),
  nse("TORNTPHARM", "Torrent Pharmaceuticals", "Pharmaceuticals", "PHARMA"),
  nse("ALKEM", "Alkem Laboratories", "Pharmaceuticals", "PHARMA"),
  nse("APOLLOHOSP", "Apollo Hospitals Enterprise", "Healthcare", "PHARMA"),
  nse("MAXHEALTH", "Max Healthcare Institute", "Healthcare", "PHARMA"),

  // ── FMCG & Consumer ──
  nse("HINDUNILVR", "Hindustan Unilever", "FMCG", "FMCG"),
  nse("ITC", "ITC", "FMCG", "FMCG"),
  nse("NESTLEIND", "Nestle India", "FMCG", "FMCG"),
  nse("BRITANNIA", "Britannia Industries", "FMCG", "FMCG"),
  nse("DABUR", "Dabur India", "FMCG", "FMCG"),
  nse("MARICO", "Marico", "FMCG", "FMCG"),
  nse("GODREJCP", "Godrej Consumer Products", "FMCG", "FMCG"),
  nse("TATACONSUM", "Tata Consumer Products", "FMCG", "FMCG"),
  nse("COLPAL", "Colgate Palmolive India", "FMCG", "FMCG"),
  nse("VBL", "Varun Beverages", "FMCG", "FMCG"),
  nse("TITAN", "Titan Company", "Consumer Discretionary", "FMCG"),
  nse("TRENT", "Trent", "Retail", "FMCG"),
  nse("DMART", "Avenue Supermarts", "Retail", "FMCG"),
  nse("ASIANPAINT", "Asian Paints", "Consumer Durables", "FMCG"),
  nse("BERGEPAINT", "Berger Paints India", "Consumer Durables", "FMCG"),
  nse("HAVELLS", "Havells India", "Consumer Durables", "FMCG"),
  nse("VOLTAS", "Voltas", "Consumer Durables", "FMCG"),

  // ── Metals & Mining ──
  nse("TATASTEEL", "Tata Steel", "Metals", "METAL"),
  nse("JSWSTEEL", "JSW Steel", "Metals", "METAL"),
  nse("HINDALCO", "Hindalco Industries", "Metals", "METAL"),
  nse("VEDL", "Vedanta", "Metals", "METAL"),
  nse("COALINDIA", "Coal India", "Mining", "METAL"),
  nse("JINDALSTEL", "Jindal Steel and Power", "Metals", "METAL"),
  nse("NMDC", "NMDC", "Mining", "METAL"),
  nse("SAIL", "Steel Authority of India", "Metals", "METAL"),
  nse("HINDZINC", "Hindustan Zinc", "Metals", "METAL"),

  // ── Infrastructure, Cement & Realty ──
  nse("LT", "Larsen and Toubro", "Infrastructure", "REALTY"),
  nse("ULTRACEMCO", "UltraTech Cement", "Cement", "REALTY"),
  nse("SHREECEM", "Shree Cement", "Cement", "REALTY"),
  nse("AMBUJACEM", "Ambuja Cements", "Cement", "REALTY"),
  nse("ACC", "ACC", "Cement", "REALTY"),
  nse("DLF", "DLF", "Realty", "REALTY"),
  nse("GODREJPROP", "Godrej Properties", "Realty", "REALTY"),
  nse("OBEROIRLTY", "Oberoi Realty", "Realty", "REALTY"),
  nse("ADANIPORTS", "Adani Ports and SEZ", "Infrastructure", "REALTY"),
  nse("ADANIENT", "Adani Enterprises", "Diversified", "REALTY"),
  nse("GRASIM", "Grasim Industries", "Diversified", "REALTY"),
  nse("SIEMENS", "Siemens India", "Capital Goods", "REALTY"),
  nse("ABB", "ABB India", "Capital Goods", "REALTY"),
  nse("BEL", "Bharat Electronics", "Defence", "REALTY"),
  nse("HAL", "Hindustan Aeronautics", "Defence", "REALTY"),
  nse("IRCTC", "Indian Railway Catering and Tourism", "Travel", "REALTY"),
  nse("INDIGO", "InterGlobe Aviation", "Aviation", "REALTY"),

  // ── Telecom & Media ──
  nse("BHARTIARTL", "Bharti Airtel", "Telecom", "IT"),
  nse("IDEA", "Vodafone Idea", "Telecom", "IT"),
  nse("ZEEL", "Zee Entertainment Enterprises", "Media", "IT"),

  // ── Chemicals ──
  nse("PIDILITIND", "Pidilite Industries", "Chemicals", "FMCG"),
  nse("SRF", "SRF", "Chemicals", "FMCG"),
  nse("UPL", "UPL", "Chemicals", "FMCG"),
  nse("DEEPAKNTR", "Deepak Nitrite", "Chemicals", "FMCG"),

  // ── Financial Services (banks, NBFCs, insurers, AMCs, exchanges) ──
  nse("ABCAPITAL", "Aditya Birla Capital", "Financial Services", "FIN"),
  nse("AUBANK", "AU Small Finance Bank", "Banking", "BANK"),
  nse("BANKINDIA", "Bank of India", "Banking", "PSUBANK"),
  nse("INDIANB", "Indian Bank", "Banking", "PSUBANK"),
  nse("MAHABANK", "Bank of Maharashtra", "Banking", "PSUBANK"),
  nse("UNIONBANK", "Union Bank of India", "Banking", "PSUBANK"),
  nse("YESBANK", "Yes Bank", "Banking", "BANK"),
  nse("BSE", "BSE Limited", "Financial Services", "FIN"),
  nse("MCX", "Multi Commodity Exchange of India", "Financial Services", "FIN"),
  nse("CRISIL", "CRISIL", "Financial Services", "FIN"),
  nse("ICICIPRULI", "ICICI Prudential Life Insurance", "Financial Services", "FIN"),
  nse("GICRE", "General Insurance Corporation of India", "Financial Services", "FIN"),
  nse("NIACL", "New India Assurance", "Financial Services", "FIN"),
  nse("LICHSGFIN", "LIC Housing Finance", "Financial Services", "FIN"),
  nse("MFSL", "Max Financial Services", "Financial Services", "FIN"),
  nse("M&MFIN", "Mahindra and Mahindra Financial Services", "Financial Services", "FIN"),
  nse("LTF", "L&T Finance", "Financial Services", "FIN"),
  nse("MOTILALOFS", "Motilal Oswal Financial Services", "Financial Services", "FIN"),
  nse("SBICARD", "SBI Cards and Payment Services", "Financial Services", "FIN"),
  nse("SUNDARMFIN", "Sundaram Finance", "Financial Services", "FIN"),
  nse("HUDCO", "Housing and Urban Development Corporation", "Financial Services", "FIN"),
  nse("TATACAP", "Tata Capital", "Financial Services", "FIN"),
  nse("NAM-INDIA", "Nippon Life India Asset Management", "Financial Services", "FIN"),
  nse("IRFC", "Indian Railway Finance Corporation", "Financial Services", "FIN"),
  nse("BAJAJHLDNG", "Bajaj Holdings and Investment", "Financial Services", "FIN"),
  nse("360ONE", "360 One Wam", "Financial Services", "FIN"),

  // ── Healthcare (additional pharma/hospitals) ──
  nse("ABBOTINDIA", "Abbott India", "Pharmaceuticals", "PHARMA"),
  nse("AJANTPHARM", "Ajanta Pharma", "Pharmaceuticals", "PHARMA"),
  nse("BIOCON", "Biocon", "Pharmaceuticals", "PHARMA"),
  nse("IPCALAB", "IPCA Laboratories", "Pharmaceuticals", "PHARMA"),
  nse("LAURUSLABS", "Laurus Labs", "Pharmaceuticals", "PHARMA"),
  nse("GLENMARK", "Glenmark Pharmaceuticals", "Pharmaceuticals", "PHARMA"),
  nse("FORTIS", "Fortis Healthcare", "Healthcare", "PHARMA"),
  nse("ZYDUSLIFE", "Zydus Lifesciences", "Pharmaceuticals", "PHARMA"),
  nse("MANKIND", "Mankind Pharma", "Pharmaceuticals", "PHARMA"),

  // ── IT & Telecom (additional) ──
  nse("KPITTECH", "KPIT Technologies", "Information Technology", "IT"),
  nse("LTTS", "L&T Technology Services", "Information Technology", "IT"),
  nse("TATAELXSI", "Tata Elxsi", "Information Technology", "IT"),
  nse("HONAUT", "Honeywell Automation India", "Information Technology", "IT"),
  nse("NAUKRI", "Info Edge India", "Internet", "IT"),
  nse("INDUSTOWER", "Indus Towers", "Telecom", "IT"),
  nse("TATACOMM", "Tata Communications", "Telecom", "IT"),

  // ── Industrials & Capital Goods (additional) ──
  nse("CGPOWER", "CG Power and Industrial Solutions", "Capital Goods", "REALTY"),
  nse("CUMMINSIND", "Cummins India", "Capital Goods", "REALTY"),
  nse("BHEL", "Bharat Heavy Electricals", "Capital Goods", "REALTY"),
  nse("THERMAX", "Thermax", "Capital Goods", "REALTY"),
  nse("POLYCAB", "Polycab India", "Capital Goods", "REALTY"),
  nse("ASTRAL", "Astral Limited", "Capital Goods", "REALTY"),
  nse("APLAPOLLO", "APL Apollo Tubes", "Capital Goods", "REALTY"),
  nse("BHARATFORG", "Bharat Forge", "Capital Goods", "REALTY"),
  nse("CONCOR", "Container Corporation of India", "Infrastructure", "REALTY"),
  nse("MAZDOCK", "Mazagon Dock Shipbuilders", "Defence", "REALTY"),
  nse("COCHINSHIP", "Cochin Shipyard", "Defence", "REALTY"),
  nse("KEI", "KEI Industries", "Capital Goods", "REALTY"),
  nse("SUPREMEIND", "Supreme Industries", "Capital Goods", "REALTY"),
  nse("RVNL", "Rail Vikas Nigam", "Infrastructure", "REALTY"),
  nse("SOLARINDS", "Solar Industries India", "Capital Goods", "REALTY"),
  nse("3MINDIA", "3M India", "Diversified", "REALTY"),
  nse("AIAENG", "AIA Engineering", "Capital Goods", "REALTY"),

  // ── Automobile & Ancillaries (additional) ──
  nse("EXIDEIND", "Exide Industries", "Auto Components", "AUTO"),
  nse("TIINDIA", "Tube Investments of India", "Auto Components", "AUTO"),
  nse("HYUNDAI", "Hyundai Motor India", "Automobile", "AUTO"),
  nse("BALKRISIND", "Balkrishna Industries", "Auto Components", "AUTO"),
  nse("APOLLOTYRE", "Apollo Tyres", "Auto Components", "AUTO"),
  nse("MRF", "MRF Limited", "Auto Components", "AUTO"),
  nse("SCHAEFFLER", "Schaeffler India", "Auto Components", "AUTO"),
  nse("UNOMINDA", "UNO Minda", "Auto Components", "AUTO"),

  // ── Consumer Discretionary & Retail (additional) ──
  nse("DIXON", "Dixon Technologies India", "Consumer Durables", "FMCG"),
  nse("BLUESTARCO", "Blue Star", "Consumer Durables", "FMCG"),
  nse("JUBLFOOD", "Jubilant Foodworks", "Retail", "FMCG"),
  nse("KPRMILL", "K.P.R. Mill", "Textiles", "FMCG"),
  nse("PAGEIND", "Page Industries", "Textiles", "FMCG"),
  nse("KALYANKJIL", "Kalyan Jewellers India", "Retail", "FMCG"),
  nse("UNITDSPR", "United Spirits", "FMCG", "FMCG"),
  nse("GODFRYPHLP", "Godfrey Phillips India", "FMCG", "FMCG"),
  nse("RADICO", "Radico Khaitan", "FMCG", "FMCG"),
  nse("UBL", "United Breweries", "FMCG", "FMCG"),
  nse("PATANJALI", "Patanjali Foods", "FMCG", "FMCG"),

  // ── Chemicals & Materials (additional) ──
  nse("COROMANDEL", "Coromandel International", "Chemicals", "FMCG"),
  nse("DALBHARAT", "Dalmia Bharat", "Cement", "REALTY"),
  nse("FLUOROCHEM", "Gujarat Fluorochemicals", "Chemicals", "FMCG"),
  nse("GODREJIND", "Godrej Industries", "Chemicals", "FMCG"),
  nse("JKCEMENT", "J K Cement", "Cement", "REALTY"),
  nse("JSL", "Jindal Stainless", "Metals", "METAL"),
  nse("LINDEINDIA", "Linde India", "Chemicals", "FMCG"),
  nse("NATIONALUM", "National Aluminium Company", "Metals", "METAL"),
  nse("PIIND", "PI Industries", "Chemicals", "FMCG"),

  // ── Power & Utilities (additional) ──
  nse("ATGL", "Adani Total Gas", "Utilities", "ENERGY"),
  nse("ADANIENSOL", "Adani Energy Solutions", "Power", "ENERGY"),
  nse("JSWENERGY", "JSW Energy", "Power", "ENERGY"),
  nse("NLCINDIA", "NLC India", "Power", "ENERGY"),
  nse("SJVN", "SJVN Limited", "Power", "ENERGY"),
  nse("TORNTPOWER", "Torrent Power", "Power", "ENERGY"),
  nse("OIL", "Oil India", "Energy", "ENERGY"),
  nse("PETRONET", "Petronet LNG", "Energy", "ENERGY"),

  // ── Realty (additional) ──
  nse("PHOENIXLTD", "The Phoenix Mills", "Realty", "REALTY"),
  nse("PRESTIGE", "Prestige Estates Projects", "Realty", "REALTY"),
  nse("LODHA", "Macrotech Developers (Lodha)", "Realty", "REALTY"),

  // ── US / global large caps ──
  us("AAPL", "Apple Inc", "Technology", "IT"),
  us("MSFT", "Microsoft Corporation", "Technology", "IT"),
  us("GOOGL", "Alphabet Inc", "Technology", "IT"),
  us("AMZN", "Amazon.com Inc", "Consumer Discretionary", "FMCG"),
  us("NVDA", "NVIDIA Corporation", "Semiconductors", "IT"),
  us("META", "Meta Platforms", "Technology", "IT"),
  us("TSLA", "Tesla Inc", "Automobile", "AUTO"),
  us("NFLX", "Netflix Inc", "Media", "IT"),
  us("JPM", "JPMorgan Chase", "Banking", "BANK"),
  us("V", "Visa Inc", "Financial Services", "FIN"),
  us("MA", "Mastercard", "Financial Services", "FIN"),
  us("WMT", "Walmart Inc", "Retail", "FMCG"),
  us("KO", "Coca-Cola Company", "FMCG", "FMCG"),
  us("XOM", "Exxon Mobil", "Energy", "ENERGY"),
  us("JNJ", "Johnson and Johnson", "Pharmaceuticals", "PHARMA"),
  us("AMD", "Advanced Micro Devices", "Semiconductors", "IT"),
  us("INTC", "Intel Corporation", "Semiconductors", "IT"),
  us("ORCL", "Oracle Corporation", "Technology", "IT"),
  us("CRM", "Salesforce", "Technology", "IT"),
  us("DIS", "Walt Disney Company", "Media", "IT"),
];

const BY_SYMBOL = new Map(UNIVERSE.map((u) => [u.symbol.toUpperCase(), u]));
const BY_DISPLAY = new Map(UNIVERSE.map((u) => [u.display.toUpperCase(), u]));

export function lookupUniverse(symbolOrDisplay: string): UniverseEntry | undefined {
  const key = symbolOrDisplay.trim().toUpperCase();
  return BY_SYMBOL.get(key) ?? BY_DISPLAY.get(key);
}

export function searchUniverse(query: string, limit = 20): UniverseEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return UNIVERSE.map((u) => {
    const d = u.display.toUpperCase();
    const n = u.name.toUpperCase();
    let score = 0;
    if (d === q) score = 100;
    else if (d.startsWith(q)) score = 80;
    else if (n.startsWith(q)) score = 70;
    else if (d.includes(q)) score = 50;
    else if (n.includes(q)) score = 40;
    else if (u.sector.toUpperCase().includes(q)) score = 20;
    return { u, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.u.display.localeCompare(b.u.display))
    .slice(0, limit)
    .map((x) => x.u);
}

export function universeBySector(sectorKey: string): UniverseEntry[] {
  return UNIVERSE.filter((u) => u.sectorKey === sectorKey);
}

export const SECTOR_NAMES = Array.from(new Set(UNIVERSE.map((u) => u.sector))).sort();
