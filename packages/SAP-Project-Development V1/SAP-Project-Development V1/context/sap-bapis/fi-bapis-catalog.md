# FI BAPI catalogue (Financial Accounting)

Extracted from **DS4 / client 100 (DS4_100_NIIF)** on 2026-09-14. 150 BAPIs, 134 remote-enabled (`TFDIR-FMODE = R`), 119 released for customer use (`RODIR`), 0 flagged obsolete.

`Rel` column: ✓ = released in `RODIR`, — = **not** in the released-objects directory (SAP-internal, no compatibility guarantee), **OBSOLETE** = released but marked obsolete.

Full signatures: [fi-bapis-signatures.md](fi-bapis-signatures.md) · machine-readable: [`json/fi-bapis.json`](json/fi-bapis.json)

| Component | BAPI | RFC | Rel | Description |
|---|---|:--:|:--:|---|
| `AC-INT` | `BAPI_ACC_ASSET_ACQ_SETT_CHECK` | — | — | RW: Anlagenzugang mit Aktivierungswertermittlung synchron [de] |
| `AC-INT` | `BAPI_ACC_ASSET_ACQ_SETT_POST` | — | — | RW: Anlagenzugang mit Aktivierungswertermittlung asynchron [de] |
| `AC-INT` | `BAPI_ACC_ASS_ACQUISITION_CHECK` | — | — | BAPI: Anlagenzugang prüfen [de] |
| `AC-INT` | `BAPI_ACC_ASS_INTRA_TRANS_CHECK` | — | — | Rechnungswesen: Anlagentransfer buchen [de] |
| `AC-INT` | `BAPI_ACC_ASS_POSTCAP_CHECK` | — | — | BAPI: Nachaktivierung prüfen [de] |
| `AC-INT` | `BAPI_ACC_ASS_RETIREMENT_CHECK` | — | — | BAPI: Anlagenabgang prüfen [de] |
| `AC-INT` | `BAPI_ACC_ASS_TRANSFER_CHECK` | — | — | Rechnungswesen: Anlagentransfer buchen [de] |
| `AC-INT` | `BAPI_ACC_ASS_TRANSFER_POST` | — | — | Rechnungswesen: Anlagentransfer buchen [de] |
| `AC-INT` | `BAPI_ACC_ASS_TRANS_ACQ_CHECK` | ✓ | ✓ | Accounting: Check acquisition from transfer |
| `AC-INT` | `BAPI_ACC_ASS_TRANS_ACQ_POST` | ✓ | ✓ | Accounting: Post acquisition from transfer |
| `AC-INT` | `BAPI_ACC_ASS_TRANS_RET_CHECK` | — | — | Rechnungswesen: Anlagentransfer buchen [de] |
| `AC-INT` | `BAPI_ACC_AUC_ACQUISITION_CHECK` | — | — | Rechnungswesen: Anlagenzugang aus Abrechnung [de] |
| `AC-INT` | `BAPI_ACC_AUC_ACQUISITION_POST` | — | — | Rechnungswesen: Anlagenzugang aus Abrechnung [de] |
| `AC-INT` | `BAPI_ACC_BILLING_CHECK` | ✓ | ✓ | Accounting: Check Billing Doc. (OAG: LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_BILLING_POST` | ✓ | ✓ | Accounting: Post Invoice (OAG: LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_BILLING_REV_CHECK` | ✓ | ✓ | Accounting: Check Billing Document Reversal (OAG: LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_BILLING_REV_POST` | ✓ | ✓ | Accounting: Post Billing Doc.Reversal (OAG: LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_DOCUMENTS_RECORD` | ✓ | ✓ | Follow-On Document Numbers in Accounting for Multiple Source Documents |
| `AC-INT` | `BAPI_ACC_DOCUMENT_CHECK` | ✓ | ✓ | Accounting: Check |
| `AC-INT` | `BAPI_ACC_DOCUMENT_POST` | ✓ | ✓ | Accounting: Posting |
| `AC-INT` | `BAPI_ACC_DOCUMENT_REV_CHECK` | ✓ | ✓ | Accounting: Check Reversal |
| `AC-INT` | `BAPI_ACC_DOCUMENT_REV_POST` | ✓ | ✓ | Accounting: Post Reversal |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_EXP_CHECK` | ✓ | ✓ | Accounting: Check G/L acct assignment for HR posting (OAG:POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_EXP_POST` | ✓ | ✓ | Accounting: Post G/L account assignment for HR posting (OAG:POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_PAY_CHECK` | ✓ | ✓ | Accounting: Check Vendor Acct Assignment for HR Posting (OAG:LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_PAY_POST` | ✓ | ✓ | Accounting: Post Vendor Acct Assignment for HR Posting (OAG: LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_REC_CHECK` | ✓ | ✓ | Accounting: Check Cust. Acct Assignmt for HR Posting (OAG:LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_EMPLOYEE_REC_POST` | ✓ | ✓ | FI/CO: Post Customer Acct Assignment for HR Posting (OAG: LOAD RECEIVABLE) |
| `AC-INT` | `BAPI_ACC_GL_POSTING_CHECK` | ✓ | ✓ | Accounting: General G/L Account Posting |
| `AC-INT` | `BAPI_ACC_GL_POSTING_POST` | ✓ | ✓ | Accounting: General G/L Account Posting |
| `AC-INT` | `BAPI_ACC_GL_POSTING_REV_CHECK` | ✓ | ✓ | Accounting: Check Reversal of General G/L Account Posting |
| `AC-INT` | `BAPI_ACC_GL_POSTING_REV_POST` | ✓ | ✓ | Accounting: Post General G/L Posting Reversal |
| `AC-INT` | `BAPI_ACC_GOODS_MOVEMENT_CHECK` | ✓ | ✓ | Accounting: Check Goods Movement (OAG: POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_GOODS_MOVEMENT_POST` | ✓ | ✓ | Accounting: Post Goods Movement (OAG: POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_GOODS_MOV_REV_CHECK` | ✓ | ✓ | Accounting: Check Goods Movement Reversal (OAG: POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_GOODS_MOV_REV_POST` | ✓ | ✓ | Accounting: Post Goods Movement Reversal (OAG: POST JOURNAL) |
| `AC-INT` | `BAPI_ACC_INVOICE_RECEIPT_CHECK` | ✓ | ✓ | Accounting: Check Invoice Receipt (OAG: LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_INVOICE_RECEIPT_POST` | ✓ | ✓ | Accounting: Post Invoice Receipt (OAG: LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_INVOICE_REV_CHECK` | ✓ | ✓ | Accounting: Check Reversal of Invoice Receipt (OAG: LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_INVOICE_REV_POST` | ✓ | ✓ | Accounting: Post Invoice Receipt Reversal (OAG: LOAD PAYABLE) |
| `AC-INT` | `BAPI_ACC_PURCHASE_ORDER_CHECK` | ✓ | ✓ | Accounting: Check Purchase Order |
| `AC-INT` | `BAPI_ACC_PURCHASE_ORDER_POST` | ✓ | ✓ | Accounting: Post Purchase Order |
| `AC-INT` | `BAPI_ACC_PURCHASE_REQUI_CHECK` | ✓ | ✓ | Accounting: Check Purchase Requisition |
| `AC-INT` | `BAPI_ACC_PURCHASE_REQUI_POST` | ✓ | ✓ | Accounting: Post Purchase Requisition |
| `AC-INT` | `BAPI_ACC_PYMNTBLK_UPDATE_CHECK` | ✓ | ✓ | Accounting: Check Changes to Payment Block for Open Items |
| `AC-INT` | `BAPI_ACC_PYMNTBLK_UPDATE_POST` | ✓ | ✓ | Accounting: Post Changes to Payment Block for Open Items |
| `AC-INT` | `BAPI_ACC_SALES_ORDER_CHECK` | ✓ | ✓ | Accounting: Check Sales Order |
| `AC-INT` | `BAPI_ACC_SALES_ORDER_POST` | ✓ | ✓ | Accounting: Post Sales Order |
| `AC-INT` | `BAPI_ACC_SALES_QUOTA_CHECK` | ✓ | ✓ | Accounting: Check Customer Quotation |
| `AC-INT` | `BAPI_ACC_SALES_QUOTA_POST` | ✓ | ✓ | Accounting: Post Customer Quotation |
| `AC-INT` | `BAPI_ACC_TRAVEL_CHECK` | ✓ | ✓ | Accounting: Check Trip |
| `AC-INT` | `BAPI_ACC_TRAVEL_POST` | ✓ | ✓ | Accounting: Post Trip |
| `FI` | `BAPI_ACC_DOCUMENT_DISPLAY` | ✓ | ✓ | Accounting: Display Method for Follow-On Document Display |
| `FI` | `BAPI_ACC_DOCUMENT_RECORD` | ✓ | — | Accounting: Follow-on Document Numbers for Source Document |
| `FI` | `BAPI_BUSINESSAREA_EXISTENCECHK` | ✓ | ✓ | Check if business area exists |
| `FI` | `BAPI_BUSINESSAREA_GETDETAIL` | ✓ | ✓ | Business area details |
| `FI` | `BAPI_BUSINESSAREA_GETLIST` | ✓ | ✓ | List of business areas |
| `FI` | `BAPI_CCODE_GET_FIRSTDAY_PERIOD` | ✓ | — | For Company Code: First Day of Period |
| `FI` | `BAPI_CCODE_GET_LASTDAY_FYEAR` | ✓ | — | For Company Code: Last Day of Fiscal Year |
| `FI` | `BAPI_COMPANYCODE_EXISTENCECHK` | ✓ | ✓ | Check if Company Code Exists |
| `FI` | `BAPI_COMPANYCODE_GETDETAIL` | ✓ | ✓ | Company Code Details |
| `FI` | `BAPI_COMPANYCODE_GETLIST` | ✓ | ✓ | List of Company Codes |
| `FI` | `BAPI_COMPANYCODE_GET_PERIOD` | ✓ | ✓ | For Company Code: Posting Date -> Period, Fiscal Year |
| `FI` | `BAPI_COMPANY_EXISTENCECHECK` | ✓ | ✓ | Check if company exists |
| `FI` | `BAPI_COMPANY_GETDETAIL` | ✓ | ✓ | Company details |
| `FI` | `BAPI_COMPANY_GETLIST` | ✓ | ✓ | List of companies |
| `FI` | `BAPI_FUNC_AREA_EXISTENCECHECK` | ✓ | ✓ | Check if functional area exists |
| `FI` | `BAPI_FUNC_AREA_GETDETAIL` | ✓ | ✓ | Functional area details |
| `FI` | `BAPI_FUNC_AREA_GETLIST` | ✓ | ✓ | List of functional areas |
| `FI-AA-AA` | `BAPI_ASSET_ACQUISITION_CHECK` | ✓ | ✓ | Check asset acquisition |
| `FI-AA-AA` | `BAPI_ASSET_ACQUISITION_POST` | ✓ | ✓ | Post Asset Acquisition |
| `FI-AA-AA` | `BAPI_ASSET_DOWNPAYMENT_CHECK` | ✓ | ✓ | Assets: Check Down Payment |
| `FI-AA-AA` | `BAPI_ASSET_DOWNPAYMENT_POST` | ✓ | ✓ | Assets: Post Down Payment |
| `FI-AA-AA` | `BAPI_ASSET_INV_SUPPORT_CHECK` | ✓ | ✓ | Assets: Check Investment Support |
| `FI-AA-AA` | `BAPI_ASSET_INV_SUPPORT_POST` | ✓ | ✓ | Assets: Post Investment Support |
| `FI-AA-AA` | `BAPI_ASSET_POSTCAP_CHECK` | ✓ | ✓ | Check post-capitalization |
| `FI-AA-AA` | `BAPI_ASSET_POSTCAP_POST` | ✓ | ✓ | Post post-capitalization |
| `FI-AA-AA` | `BAPI_ASSET_RETIREMENT_CHECK` | ✓ | ✓ | Check asset retirement |
| `FI-AA-AA` | `BAPI_ASSET_RETIREMENT_POST` | ✓ | ✓ | Post asset retirement |
| `FI-AA-AA` | `BAPI_ASSET_REVALUATION_CHECK` | ✓ | ✓ | Assets: Check Revaluation |
| `FI-AA-AA` | `BAPI_ASSET_REVALUATION_POST` | ✓ | ✓ | Assets: Post Revaluation |
| `FI-AA-AA` | `BAPI_ASSET_REVERSAL_CHECK` | ✓ | ✓ | Check Asset Document Reversal |
| `FI-AA-AA` | `BAPI_ASSET_REVERSAL_POST` | ✓ | ✓ | Post Asset Document Reversal |
| `FI-AA-AA` | `BAPI_ASSET_SUB_COST_REV_CHECK` | ✓ | ✓ | Assets: Check Subsequent Costs and Revenue |
| `FI-AA-AA` | `BAPI_ASSET_SUB_COST_REV_POST` | ✓ | ✓ | Assets: Post Subsequent Costs and Revenue |
| `FI-AA-AA` | `BAPI_ASSET_TRANSFER_CHECK` | ✓ | ✓ | Assets: Check Intracompany Transfer |
| `FI-AA-AA` | `BAPI_ASSET_TRANSFER_POST` | ✓ | ✓ | Assets: Post Intracompany Transfer |
| `FI-AA-AA` | `BAPI_ASSET_VALUE_ADJUST_CHECK` | ✓ | ✓ | Assets: Check Depreciation |
| `FI-AA-AA` | `BAPI_ASSET_VALUE_ADJUST_POST` | ✓ | ✓ | Assets: Post Depreciation |
| `FI-AA-AA` | `BAPI_ASSET_WRITEUP_CHECK` | ✓ | ✓ | Assets: Check Write-Up |
| `FI-AA-AA` | `BAPI_ASSET_WRITEUP_POST` | ✓ | ✓ | Assets: Post Write-Up |
| `FI-AA-AA` | `BAPI_FIXEDASSET_CHANGE` | ✓ | ✓ | Changes an Asset |
| `FI-AA-AA` | `BAPI_FIXEDASSET_CREATE` | ✓ | ✓ | Creates an Asset |
| `FI-AA-AA` | `BAPI_FIXEDASSET_CREATE1` | ✓ | ✓ | Creates an Asset |
| `FI-AA-AA` | `BAPI_FIXEDASSET_GETDETAIL` | ✓ | ✓ | Display Detailed Information on a Fixed Asset |
| `FI-AA-AA` | `BAPI_FIXEDASSET_GETLIST` | ✓ | ✓ | Information on Selected Assets |
| `FI-AA-AA` | `BAPI_FIXEDASSET_OVRTAKE_CREATE` | ✓ | ✓ | BAPI for Legacy Data Transfer |
| `FI-AA-AA` | `BAPI_FIXEDASSET_OVRTAKE_POST` | ✓ | ✓ | BAPI for Legacy Data Transfer: Post Transfer Values to Existing Asset |
| `FI-AP-AP` | `BAPI_AP_ACC_GETBALANCEDITEMS` | ✓ | ✓ | Vendor Account Clearing Transactions in a given Period |
| `FI-AP-AP` | `BAPI_AP_ACC_GETCURRENTBALANCE` | ✓ | ✓ | Vendor Account Closing Balance in Current Fiscal Year |
| `FI-AP-AP` | `BAPI_AP_ACC_GETKEYDATEBALANCE` | ✓ | ✓ | Vendor Account Balance at Key Date |
| `FI-AP-AP` | `BAPI_AP_ACC_GETOPENITEMS` | ✓ | ✓ | Vendor Account Open Items at a Key Date |
| `FI-AP-AP` | `BAPI_AP_ACC_GETPERIODBALANCES` | ✓ | ✓ | Posting Period Balances per Vendor Account in Current Fiscal Year |
| `FI-AP-AP` | `BAPI_AP_ACC_GETSTATEMENT` | ✓ | ✓ | Vendor Account Statement for a given Period |
| `FI-AR-AR` | `BAPI_AR_ACC_GETBALANCEDITEMS` | ✓ | ✓ | Customer account clearing transactions in a given time period |
| `FI-AR-AR` | `BAPI_AR_ACC_GETCURRENTBALANCE` | ✓ | ✓ | Closing balance of customer account in current fiscal year |
| `FI-AR-AR` | `BAPI_AR_ACC_GETKEYDATEBALANCE` | ✓ | ✓ | Customer account balance at a key date |
| `FI-AR-AR` | `BAPI_AR_ACC_GETOPENITEMS` | ✓ | ✓ | Customer account open items at a key date |
| `FI-AR-AR` | `BAPI_AR_ACC_GETPERIODBALANCES` | ✓ | ✓ | Posting period totals per customer account in current fiscal year |
| `FI-AR-AR` | `BAPI_AR_ACC_GETSTATEMENT` | ✓ | ✓ | Customer account statement for a given period |
| `FI-AR-AR` | `BAPI_CREDIT_ACCOUNT_GET_STATUS` | ✓ | ✓ | Determine Credit Status of Credit Account |
| `FI-AR-AR` | `BAPI_CREDIT_ACCOUNT_REP_STATUS` | ✓ | ✓ | Receive Credit Management Account Status and Send to Database |
| `FI-AR-AR` | `BAPI_CR_ACC_GETDETAIL` | ✓ | ✓ | BAPI/BUS1010: Determine Master Record Data |
| `FI-AR-AR` | `BAPI_CR_ACC_GETHIGHESTDUNNINGL` | ✓ | ✓ | BAPI/BUS1010: Determine Highest Dunning Level |
| `FI-AR-AR` | `BAPI_CR_ACC_GETOLDESTOPENITEM` | ✓ | ✓ | BAPI/BUS1010: Determine Oldest Open Item |
| `FI-AR-AR` | `BAPI_CR_ACC_GETOPENITEMSSTRUCT` | ✓ | ✓ | BAPI/BUS1010: Determine OI Structure |
| `FI-AR-AR` | `BAPI_DEBTOR_CHANGEPASSWORD` | ✓ | — | Change Customer Password |
| `FI-AR-AR` | `BAPI_DEBTOR_CHECKPASSWORD` | ✓ | — | Check Customer Password |
| `FI-AR-AR` | `BAPI_DEBTOR_CREATE_PW_REG` | ✓ | — | Create Entry for Customer Password |
| `FI-AR-AR` | `BAPI_DEBTOR_DELETE_PW_REG` | ✓ | — | Delete Customer Password Entry |
| `FI-AR-AR` | `BAPI_DEBTOR_EXISTENCECHECK` | ✓ | — | Check Customer Existence |
| `FI-AR-AR` | `BAPI_DEBTOR_FIND` | ✓ | ✓ | Customer Matchcode |
| `FI-AR-AR` | `BAPI_DEBTOR_GETDETAIL` | ✓ | — | Customer Detail Information |
| `FI-AR-AR` | `BAPI_DEBTOR_GET_PW_REG` | ✓ | — | Read entry for customer password |
| `FI-AR-AR` | `BAPI_DEBTOR_INITPASSWORD` | ✓ | — | Initialize Customer Password |
| `FI-BL-PT` | `BAPI_ACCSTMT_CREATEFROMBALANCE` | — | — | Store account balance/check debit information |
| `FI-BL-PT` | `BAPI_ACCSTMT_CREATEFROMLOCKBOX` | — | — | Create lockbox data |
| `FI-BL-PT` | `BAPI_ACCSTMT_CREATEFROMPREVDAY` | — | — | Create Bank Statement/Day-End Statement |
| `FI-BL-PT` | `BAPI_ACCSTMT_CREATEFROMSAMEDAY` | — | — | Create Bank Statement/Today's Data |
| `FI-BL-PT` | `BAPI_CASHJOURNALDOC_CREATE` | ✓ | ✓ | Save FI Cash Journal Documents |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_CANCEL` | ✓ | ✓ | Cancel Payment Request |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_CREATE` | ✓ | ✓ | Creation of a Payment Request |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_GETLIST` | ✓ | ✓ | List of Payment Requests with Selections |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_GETSTATUS` | ✓ | ✓ | Determination of Payment Request Status |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_POST` | ✓ | ✓ | Posting a Parked Payment Request |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQUEST_RELEASE` | ✓ | ✓ | Payment Request Released for Payment |
| `FI-BL-PT-AP` | `BAPI_PAYMENTREQ_STARTPAYMENT` | ✓ | ✓ | Start Payment of Payment Request |
| `FI-GL-GL` | `BAPI_ACC_POST_STAT_KEYFIGURE` | ✓ | — | Verbuchen von stat. Kennzahlen [de] |
| `FI-GL-GL` | `BAPI_FAGL_PLANNING_POST` | ✓ | ✓ | BAPI for Transferring Plan Data to New General Ledger Accounting |
| `FI-GL-GL` | `BAPI_FAGL_PLANNING_READ` | — | — | Read In Data |
| `FI-GL-GL` | `BAPI_GL_ACC_GETDETAIL` | ✓ | ✓ | G/L account details |
| `FI-GL-GL-N` | `BAPI_GLX_GETDOCITEMS` | ✓ | ✓ | Line Item of Document for Ledger with Totals Table FAGLFLEXT |
| `FI-GL-GL-N` | `BAPI_GL_ACC_EXISTENCECHECK` | ✓ | ✓ | Check existence of G/L account |
| `FI-GL-GL-N` | `BAPI_GL_ACC_GETBALANCE` | ✓ | ✓ | Closing balance of G/L account for chosen year |
| `FI-GL-GL-N` | `BAPI_GL_ACC_GETCURRENTBALANCE` | ✓ | ✓ | Closing balance of G/L account for current year |
| `FI-GL-GL-N` | `BAPI_GL_ACC_GETLIST` | ✓ | ✓ | List of G/L accounts for each company code |
| `FI-GL-GL-N` | `BAPI_GL_ACC_GETPERIODBALANCES` | ✓ | ✓ | Posting period balances for each G/L account |
| `FI-GL-GL-N` | `BAPI_GL_GETGLACCBALANCE` | ✓ | — | Closing balance of G/L account for chosen year |
| `FI-GL-GL-N` | `BAPI_GL_GETGLACCCURRENTBALANCE` | ✓ | — | Closing balance of G/L account for current year |
| `FI-GL-GL-N` | `BAPI_GL_GETGLACCPERIODBALANCES` | ✓ | — | Posting period balances for each G/L account |
