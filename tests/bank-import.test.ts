import { describe, expect, it } from "vitest";
import {
  assignMatches, csvRows, decodeStatement, hashLines, lineHash, matchCandidates, parseStatement, readAmount, readDay, reconcile, StatementError, type LedgerItem,
} from "@/lib/bank-import";

const lines = (text: string, format?: Parameters<typeof parseStatement>[1], map?: Parameters<typeof parseStatement>[2]) => parseStatement(text, format, map).lines;

describe("amounts", () => {
  it("read the ways banks write rand, to cents", () => {
    const cases: [string, number | null][] = [
      ["1 234,56", 123456], ["1,234.56", 123456], ["1.234,56", 123456], ["1234.56", 123456], ["-1234.56", -123456], ["−150", -15000],
      ["(1,234.56)", -123456], ["1234.56 CR", 123456], ["1234.56DR", -123456], ["1 500.00-", -150000], ["R -50.00", -5000], ["-R50", -5000],
      ["R1 234", 123400], ["ZAR 99,99", 9999], ["0,5", 50], [".75", 75], ["+12", 1200], ["1,234", 123400], ["1,234,567.89", 123456789],
      ["150.", 15000], ["1 234.50 Dr", -123450], ["", null], ["-", null], ["  ", null],
    ];
    for (const [raw, cents] of cases) expect(readAmount(raw), raw).toBe(cents);
  });

  it("refuse what isn't an amount", () => {
    for (const raw of ["abc", "1.2.3,4.5", "1.234567", "12-34", "R"]) expect(() => readAmount(raw), raw).toThrow(StatementError);
    expect(() => readAmount("abc")).toThrow("“abc” isn't an amount");
    expect(() => readAmount("0.125")).toThrow("more than two decimals");
  });
});

describe("dates", () => {
  it("read day first, ISO, compact and month names (English and Afrikaans), with or without a time", () => {
    const cases: [string, string | null][] = [
      ["05/10/2026", "2026-10-05"], ["5/10/26", "2026-10-05"], ["2026-10-05", "2026-10-05"], ["2026/10/05", "2026-10-05"], ["20261005", "2026-10-05"],
      ["20261005120000.000[+2:SAST]", "2026-10-05"], ["05 Oct 2026", "2026-10-05"], ["5-Oct-26", "2026-10-05"], ["05Oct2026", "2026-10-05"],
      ["5 October 2026", "2026-10-05"], ["05 Okt 2026", "2026-10-05"], ["1 Mei 2026", "2026-05-01"], ["Oct 5, 2026", "2026-10-05"],
      ["2026-10-05 13:45:00", "2026-10-05"], ["05/10/2026 13:45", "2026-10-05"], ["31/02/2026", null], ["2026-13-01", null], ["Opening", null], ["", null],
    ];
    for (const [raw, day] of cases) expect(readDay(raw), raw).toBe(day);
    expect(readDay("10/25/2026", "MDY")).toBe("2026-10-25");
  });
});

describe("the big five banks' downloads", () => {
  it("FNB: record-numbered rows, three description columns, pending lines left out, the account from record 2", () => {
    const fnb = [
      "2,'62012345678','Gold Business Account','HERBAL HOLLAND HATFIELD'",
      "3,'Statement Number','Statement Date','Opening Balance','Closing Balance','VAT Amount','Interest Rate'",
      "3,'14','2026/10/05','10000.00','14235.50','12.00','0.00'",
      "5,'Number','Date','Description1','Description2','Description3','Amount','Balance','Accrued Charges'",
      "5,1,'01 Oct 2026','Magtape Credit','TST01-261001','Cash Deposit',5000.00,15000.00,0.00",
      "5,2,'02 Oct 2026','#Monthly Account Fee','','',-150.00,14850.00,0.00",
      "5,3,'02 Oct 2026','FNB App Payment To','Acme Packaging','INV 1043',-1250.00,13600.00,0.00",
      "5,4,'03 Oct 2026','Merchant Settlement','YOCO 0012345','',635.50,14235.50,0.00",
      "5,5,'05 Oct 2026','POS Purchase (pending)','Checkers','',-99.99,14135.51,0.00",
    ].join("\r\n");
    const r = parseStatement(fnb);
    expect(r).toMatchObject({ format: "FNB", account: "62012345678", skipped: 1, failed: [] });
    expect(r.lines).toEqual([
      { date: "2026-10-01", amountCents: 500000, description: "Magtape Credit TST01-261001 Cash Deposit", balanceCents: 1500000 },
      { date: "2026-10-02", amountCents: -15000, description: "#Monthly Account Fee", balanceCents: 1485000 },
      { date: "2026-10-02", amountCents: -125000, description: "FNB App Payment To Acme Packaging INV 1043", balanceCents: 1360000 },
      { date: "2026-10-03", amountCents: 63550, description: "Merchant Settlement YOCO 0012345", balanceCents: 1423550 },
    ]);
    expect(parseStatement(fnb, "FNB").format).toBe("FNB");
  });

  it("Absa: debit and credit columns, spaces in thousands, a brought-forward line skipped", () => {
    const absa = [
      "Date,Transaction Description,Charge,Debit Amount,Credit Amount,Balance",
      '01/10/2026,Bal Brought Forward,,,,"21 450.00"',
      '02/10/2026,ACB CREDIT HERBAL HOLLAND STMT 2026-09,,,"4 300.00","25 750.00"',
      '02/10/2026,ADMINISTRATION CHARGE,A,-95.00,,"25 655.00"',
      '05/10/2026,DIGITAL PAYMENT DT SARS VAT201 4410000000,,"12 400.00-",,"13 255.00"',
    ].join("\n");
    const r = parseStatement(absa);
    expect(r).toMatchObject({ format: "ABSA", skipped: 1, failed: [] });
    expect(r.lines).toEqual([
      { date: "2026-10-02", amountCents: 430000, description: "ACB CREDIT HERBAL HOLLAND STMT 2026-09", balanceCents: 2575000 },
      { date: "2026-10-02", amountCents: -9500, description: "ADMINISTRATION CHARGE", balanceCents: 2565500 },
      { date: "2026-10-05", amountCents: -1240000, description: "DIGITAL PAYMENT DT SARS VAT201 4410000000", balanceCents: 1325500 },
    ]);
  });

  it("Standard Bank: HIST records, balances run on from the opening balance, the account from ACC-NO", () => {
    const sb = [
      "ACC-NO,000123456789,,,,,",
      "OPEN,20261001,,8000.00,OPEN BALANCE,,",
      "HIST,20261001,,-35.50,MONTHLY MANAGEMENT FEE,,0",
      "HIST,20261002,,2500.00,IB TRANSFER FROM,SAVINGS 0001,0",
      "HIST,20261003,,-1999.99,DEBIT ORDER,SECURITYCO 88123,0",
      "CLOSE,20261005,,8464.51,CLOSE BALANCE,,",
    ].join("\n");
    const r = parseStatement(sb);
    expect(r).toMatchObject({ format: "STANDARD", account: "000123456789", failed: [] });
    expect(r.lines).toEqual([
      { date: "2026-10-01", amountCents: -3550, description: "MONTHLY MANAGEMENT FEE", balanceCents: 796450 },
      { date: "2026-10-02", amountCents: 250000, description: "IB TRANSFER FROM", reference: "SAVINGS 0001", balanceCents: 1046450 },
      { date: "2026-10-03", amountCents: -199999, description: "DEBIT ORDER", reference: "SECURITYCO 88123", balanceCents: 846451 },
    ]);
    expect(parseStatement(sb, "STANDARD").lines).toHaveLength(3);
  });

  it("Nedbank: account details above the headings, decimal commas, newest first (put in date order)", () => {
    const ned = [
      '"Nedbank","Transaction history"',
      '"Account number","1987654321"',
      '"Account description","Current account"',
      '""',
      '"Date","Description","Reference","Amount","Balance"',
      '"05Oct2026","POS PURCHASE CHECKERS HATFIELD","CARD 1234","-1 299,00","8 701,00"',
      '"03Oct2026","PAYSHAP CREDIT","HH TST01 SALE 0042","650,00","10 000,00"',
      '"01Oct2026","OPENING BALANCE","","","9 350,00"',
    ].join("\n");
    const r = parseStatement(ned);
    expect(r).toMatchObject({ format: "NEDBANK", account: "1987654321", skipped: 1 });
    expect(r.lines).toEqual([
      { date: "2026-10-03", amountCents: 65000, description: "PAYSHAP CREDIT", reference: "HH TST01 SALE 0042", balanceCents: 1000000 },
      { date: "2026-10-05", amountCents: -129900, description: "POS PURCHASE CHECKERS HATFIELD", reference: "CARD 1234", balanceCents: 870100 },
    ]);
  });

  it("Capitec: money in, money out and a fee column; the fee becomes a line of its own", () => {
    const cap = [
      "Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance",
      "1,1501234567,2026-10-01,2026-09-30,Herbal Holland,Received: Herbal Holland Stmt Sep,Income,Other Income,1500.00,,,3500.00",
      "2,1501234567,2026-10-02,2026-10-02,Makro,Card Purchase: Makro Centurion,Shopping,Groceries,,-845.20,,2654.80",
      "3,1501234567,2026-10-02,2026-10-02,Acme Packaging,Payment: Acme Packaging INV 1044,Business,Suppliers,,-2000.00,-6.00,648.80",
      "4,1501234567,2026-10-03,2026-10-03,Monthly Fee,Monthly Account Admin Fee,Fees,Bank Fees,,,-7.50,641.30",
    ].join("\n");
    const r = parseStatement(cap);
    expect(r).toMatchObject({ format: "CAPITEC", account: "1501234567", failed: [] });
    expect(r.lines).toEqual([
      { date: "2026-10-01", amountCents: 150000, description: "Received: Herbal Holland Stmt Sep", balanceCents: 350000 },
      { date: "2026-10-02", amountCents: -84520, description: "Card Purchase: Makro Centurion", balanceCents: 265480 },
      { date: "2026-10-02", amountCents: -200000, description: "Payment: Acme Packaging INV 1044", balanceCents: 65480 },
      { date: "2026-10-02", amountCents: -600, description: "Fee: Payment: Acme Packaging INV 1044", balanceCents: 64880 },
      { date: "2026-10-03", amountCents: -750, description: "Monthly Account Admin Fee", balanceCents: 64130 },
    ]);
  });

  it("refuse a bank chosen by hand that the file isn't from, and say which it is", () => {
    const cap = "Posting Date,Description,Money In,Money Out,Fee,Balance\n2026-10-01,X,1.00,,,1.00";
    expect(() => parseStatement(cap, "FNB")).toThrow("This looks like Capitec's download, not FNB's");
    expect(() => parseStatement("Date,Narrative\n2026-10-01,x", "ABSA")).toThrow("This doesn't look like Absa's download");
    // Headings any bank could use are read as the bank chosen.
    expect(parseStatement("Date,Description,Amount,Balance\n2026-10-01,Interest,1.00,1.00", "NEDBANK").format).toBe("NEDBANK");
  });
});

describe("OFX", () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261005120000[+2:SAST]<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>ZAR<BANKACCTFROM><BANKID>250655<ACCTID>62012345678<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261005
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001120000[+2:SAST]<TRNAMT>5000.00<FITID>2026100101<NAME>CASH DEPOSIT<MEMO>TST01-261001</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002<TRNAMT>-150.00<FITID>2026100201<NAME>MONTHLY ACCOUNT FEE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-1250.00<FITID>2026100301<NAME>ACME PACKAGING &amp; CO<MEMO>INV 1043<CHECKNUM>1043</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>13600.00<DTASOF>20261005</LEDGERBAL>
<AVAILBAL><BALAMT>13500.00<DTASOF>20261005</AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("reads STMTTRN (SGML), the account, and the ledger balance onto the last line", () => {
    const r = parseStatement(sgml);
    expect(r).toMatchObject({ format: "OFX", account: "62012345678", failed: [] });
    expect(r.lines).toEqual([
      { date: "2026-10-01", amountCents: 500000, description: "CASH DEPOSIT TST01-261001" },
      { date: "2026-10-02", amountCents: -15000, description: "MONTHLY ACCOUNT FEE" },
      { date: "2026-10-03", amountCents: -125000, description: "ACME PACKAGING & CO INV 1043", reference: "1043", balanceCents: 1360000 },
    ]);
  });

  it("reads OFX 2 (XML), and refuses two accounts in one file or a CSV chosen as OFX", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>1501234567</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261004</DTPOSTED><TRNAMT>-49.95</TRNAMT><FITID>a1</FITID><NAME>CARD FEE</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseStatement(xml, "OFX").lines).toEqual([{ date: "2026-10-04", amountCents: -4995, description: "CARD FEE" }]);
    const two = sgml.replace("</STMTRS>", "</STMTRS><STMTRS><BANKACCTFROM><ACCTID>999888777</BANKACCTFROM></STMTRS>");
    expect(() => parseStatement(two)).toThrow("more than one account");
    expect(() => parseStatement("Date,Description,Amount\n2026-10-01,x,1", "OFX")).toThrow("This isn't an OFX file");
    expect(() => parseStatement(sgml, "FNB")).toThrow("This is an OFX file");
  });
});

describe("any other CSV", () => {
  it("is read by the headings it has, or by the columns someone names", () => {
    const yoco = 'Payout date;Details;Paid out;Received;Running total\n2026-10-01;"Yoco payout; batch 778";;"1 210,40";"1 210,40"\n2026-10-02;Chargeback;"35,00";;"1 175,40"';
    expect(lines(yoco, "CSV", { date: "Payout date", description: "details", debit: "Paid out", credit: "Received", balance: "Running total" })).toEqual([
      { date: "2026-10-01", amountCents: 121040, description: "Yoco payout; batch 778", balanceCents: 121040 },
      { date: "2026-10-02", amountCents: -3500, description: "Chargeback", balanceCents: 117540 },
    ]);
    const bare = "01/10/2026,Interest,12.34\n02/10/2026,Charge,-5.00";
    expect(lines(bare, "CSV", { date: "1", description: "2", amount: "3" })).toEqual([
      { date: "2026-10-01", amountCents: 1234, description: "Interest" },
      { date: "2026-10-02", amountCents: -500, description: "Charge" },
    ]);
    expect(() => parseStatement(yoco, "CSV", { date: "Payout date", description: "Narrative", amount: "Received" })).toThrow("There's no “Narrative” column in the file.");
    expect(() => parseStatement(yoco, "CSV", { date: "Payout date", description: "Details" })).toThrow("Name the amount column");
  });

  it("copes with a BOM, quotes, a description running onto the next row, totals, blank rows and lines it can't read", () => {
    const csv = [
      "﻿Date,Description,Amount,Balance",
      '"Opening balance",,,1000.00',
      '01/10/2026,"Payment to ""Big"" Supplier, Pretoria",-100.00,900.00',
      ",continued text,,",
      "02/10/2026,Refund,50.00,950.00",
      "",
      "Total,,-50.00,",
      "31/02/2026,Bad date,1.00,",
      "03/10/2026,Bad amount,abc,",
    ].join("\n");
    const r = parseStatement(csv);
    expect(r.format).toBe("CSV");
    expect(r.lines).toEqual([
      { date: "2026-10-01", amountCents: -10000, description: 'Payment to "Big" Supplier, Pretoria continued text', balanceCents: 90000 },
      { date: "2026-10-02", amountCents: 5000, description: "Refund", balanceCents: 95000 },
    ]);
    expect(r.skipped).toBe(2);
    expect(r.failed).toEqual([
      { row: 8, error: "“31/02/2026” isn't a date" },
      { row: 9, error: "“abc” isn't an amount" },
    ]);
  });

  it("orders one day's lines by their balances, and reads month-first dates when that's all they can be", () => {
    const newestFirst = "Date,Description,Amount,Balance\n05/10/2026,C,-10.00,70.00\n05/10/2026,B,-20.00,80.00\n05/10/2026,A,100.00,100.00";
    expect(lines(newestFirst).map((l) => l.description)).toEqual(["A", "B", "C"]);
    expect(lines("Date,Description,Amount\n10/02/2026,Y,2.00\n10/25/2026,X,1.00").map((l) => l.date)).toEqual(["2026-10-02", "2026-10-25"]);
    expect(lines("Date\tDescription\tAmount\n2026-10-01\tTabbed\t1.00")).toEqual([{ date: "2026-10-01", amountCents: 100, description: "Tabbed" }]);
  });

  it("says clearly when a file isn't a statement it can read", () => {
    expect(() => parseStatement("hello,world\n1,2")).toThrow("We don't recognise this file");
    expect(() => parseStatement("   ")).toThrow("The file is empty.");
    expect(() => csvRows('Date,Description\n2026-10-01,"never closed')).toThrow("A quoted cell is never closed");
  });
});

describe("the file", () => {
  it("is decoded as UTF-8, Windows-1252 or UTF-16; workbooks and PDFs are turned away", () => {
    expect(decodeStatement(new TextEncoder().encode("Café,1"))).toBe("Café,1");
    expect(decodeStatement(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
    expect(decodeStatement(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]))).toBe("﻿AB".slice(1));
    expect(() => decodeStatement(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow("spreadsheet workbook");
    expect(() => decodeStatement(new TextEncoder().encode("%PDF-1.7"))).toThrow("PDF statement");
  });
});

describe("duplicates", () => {
  const line = { date: "2026-10-05", amountCents: -5000, description: "POS PURCHASE  coffee", balanceCents: 10000 };

  it("hash the same line the same way in the same account, and two identical lines in a file differently", () => {
    expect(lineHash("ba1", line, 0)).toBe(lineHash("ba1", { ...line, description: "pos purchase coffee" }, 0));
    expect(lineHash("ba1", line, 0)).not.toBe(lineHash("ba2", line, 0));
    expect(lineHash("ba1", line, 0)).not.toBe(lineHash("ba1", line, 1));
    expect(lineHash("ba1", line, 0)).not.toBe(lineHash("ba1", { ...line, balanceCents: 9999 }, 0));
    const twice = hashLines("ba1", [{ ...line, balanceCents: undefined }, { ...line, balanceCents: undefined }]);
    expect(twice[0].hash).not.toBe(twice[1].hash);
    expect(hashLines("ba1", [{ ...line, balanceCents: undefined }, { ...line, balanceCents: undefined }]).map((l) => l.hash)).toEqual(twice.map((l) => l.hash));
  });
});

describe("matching", () => {
  const item = (id: string, date: string, amountCents: number, text = ""): LedgerItem => ({ id, date, amountCents, text });

  it("needs the exact amount and direction within the window, nearest date first, then reference words", () => {
    const line = { date: "2026-10-05", amountCents: 500000, description: "CASH DEPOSIT TST01-261005 HATFIELD", reference: null };
    const items = [
      item("out", "2026-10-05", -500000, "Payment"),
      item("cent", "2026-10-05", 499999, "Deposit"),
      item("far", "2026-09-28", 500000, "Deposit DEP-000098"),
      item("two-days", "2026-10-03", 500000, "Deposit DEP-000101 ref TST01-261003"),
      item("two-days-ref", "2026-10-07", 500000, "Deposit DEP-000102 ref TST01-261005"),
      item("same-day", "2026-10-05", 500000, "Deposit DEP-000103"),
    ];
    const c = matchCandidates(line, items, 5);
    expect(c.map((x) => x.item.id)).toEqual(["same-day", "two-days-ref", "two-days"]);
    expect(c[1]).toMatchObject({ days: 2, overlap: 2 });
    expect(matchCandidates(line, items, 10).map((x) => x.item.id)).toContain("far");
  });
});

describe("matching by itself", () => {
  const assign = (c: Record<string, string[]>) => Object.fromEntries(assignMatches(new Map(Object.entries(c))));

  it("takes a line's only candidate, then what that leaves the others; never guesses between two", () => {
    expect(assign({ a: ["p"], b: ["p", "q"] })).toEqual({ a: "p", b: "q" });
    expect(assign({ a: ["p"], b: ["q"], c: ["q", "r"] })).toEqual({ a: "p", b: "q", c: "r" });
    expect(assign({ a: ["p"], b: ["p"] })).toEqual({});
    expect(assign({ a: ["p", "q"], b: ["p", "q"] })).toEqual({});
    expect(assign({ a: [], b: ["p"] })).toEqual({ b: "p" });
  });
});

describe("reconciliation", () => {
  it("explains the books from the statement: in transit, still to sort out, and the opening", () => {
    // Opening 1 000 in both; a deposit of 500 on both; a bank charge of 20 not yet in the books; a deposit of 300 not
    // yet on the statement.
    const r = reconcile({ ledgerCents: 1800_00, statementCents: 1480_00, openingCents: 1000_00, broughtForwardCents: 1000_00, outstandingCents: 300_00, notInBooksCents: -20_00 });
    expect(r).toEqual({ differenceCents: 320_00, openingDiffCents: 0, expectedCents: 1800_00, unexplainedCents: 0 });
    // A month's statement that was never imported shows up as unexplained.
    expect(reconcile({ ledgerCents: 1800_00, statementCents: 1300_00, openingCents: 1000_00, broughtForwardCents: 1000_00, outstandingCents: 300_00, notInBooksCents: -20_00 }).unexplainedCents).toBe(180_00);
    expect(reconcile({ ledgerCents: 1, statementCents: null, openingCents: null, broughtForwardCents: 0, outstandingCents: 0, notInBooksCents: 0 })).toEqual({ differenceCents: null, openingDiffCents: null, expectedCents: null, unexplainedCents: null });
  });
});

describe("hostile files", () => {
  it("are read or refused at once, however they're built", () => {
    const attempt = (text: string, format?: Parameters<typeof parseStatement>[1]) => {
      const t = performance.now();
      try {
        parseStatement(text, format);
      } catch {
        // refused is fine; slow is not
      }
      return performance.now() - t;
    };
    expect(attempt(`<OFX>${"<STMTTRN>".repeat(200_000)}`, "OFX")).toBeLessThan(500); // transactions that never close
    expect(attempt(`${"(".repeat(500_000)},Description,Amount\n2026-10-01,Fee,1.00`)).toBeLessThan(500); // a heading of brackets
    expect(attempt(`<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>1${" ".repeat(500_000)}x</STMTTRN>`, "OFX")).toBeLessThan(500); // an amount of spaces
  });
});
