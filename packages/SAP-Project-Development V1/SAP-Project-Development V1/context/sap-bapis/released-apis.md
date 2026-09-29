# API release state - TRM & FI on DS4/100

Answers one question: **which of these APIs may we actually build against?**
Project rule 9 says *released APIs only*, so this is the gate, not a footnote.

Everything in the tables below was read from **DS4 client 100 on 2026-09-14**. The official SAP
references are listed at the end and are *not* the source of the numbers here - they are where to
verify a specific API before committing to it.

## The two release models, and which one applies

SAP has two unrelated notions of "released", and a BAPI can be one and not the other.

| | Classic release | ABAP Cloud C1 release contract |
|---|---|---|
| Question it answers | "Is this released for customer use, with a compatibility guarantee?" | "May this be called from a clean-core / ABAP-for-Cloud language version?" |
| Where it lives | table **`RODIR`** (*Released Objects Directory*) | the `ARS_*` tables / ADT object properties |
| On DS4 | **populated - captured below** | **`ARS_SHIP_API`, `ARS_SHIP_REL_DAT`, `ARS_CONTRACT_REG` are all empty** |
| Applies to dyngw v2 `FUNC` calls | **yes - this is the relevant one** | only if the caller is a cloud language version; dyngw v2 is classic ABAP |

Because dyngw v2 dispatches classic RFC-enabled function modules from standard ABAP, **`RODIR` is the
gate that matters here**. The C1 contract state cannot be read from the DDIC on this system at all -
those tables carry SAP-internal shipment data and are empty on a customer install - so a clean-core
claim about any object below still needs a per-object ADT check.

## What the system says

| | TRM | FI | Total |
|---|--:|--:|--:|
| BAPIs catalogued | 380 | 150 | 530 |
| **Released** (`RODIR.RELEASED = X`) | 339 | 119 | 458 |
| **Not in `RODIR`** - SAP-internal, no guarantee | 41 | 31 | 72 |
| Flagged **obsolete** | 1 | 0 | 1 |

Per-BAPI flags are in the JSON (`released`, `obsolete`, `reworked`, `inReleasedObjectsDirectory`) and
in the `Rel` column of both catalogues.

### Released *and* obsolete

- **`BAPI_TEX_EXPOSURE_DELETE`** (`FTR_TEX_EXPOSURE_BAPI`, FIN-FSCM-TRM-TM) - Delete Raw Expsoure

`RELEASED = X` with `OBSOLETE = X` means SAP released it once and has since superseded it. Released
is not the same as current - **check both flags**, not just `released`.

### TRM BAPIs not in `RODIR` (41)

These are real, callable function modules, but SAP publishes no release guarantee for them. Using one
is a deliberate exception to rule 9, not a default.

| BAPI | Function group | Description |
|---|---|---|
| `BAPI_FTR_CHANGE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Change an FX Option |
| `BAPI_FTR_CP_GET_FIELD_MAPPING` | `FTR_BAPI_CP` | Access to the Product Category-Specific Mapping Table |
| `BAPI_FTR_CREATE_SECURITY` | `FTR_IRATE` | Investments |
| `BAPI_FTR_CREATE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Create Currency Option |
| `BAPI_FTR_EXECUTE_ORDER` | `FTR_BUS2042` | Execute order financial transaction |
| `BAPI_FTR_EXERCISE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Exercise FX Option |
| `BAPI_FTR_EXPIRE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Allow FX Option to Expire |
| `BAPI_FTR_FXT_TERMINATE` | `FTR_BAPI_FXT` | Settle a Foreign Exchange Transaction |
| `BAPI_FTR_GIVENOTICE_FXOPTIONS` | `FTR_BAPI_FXT` | Give Notice/Terminate FX Option |
| `BAPI_FTR_KNOCKIN_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Knockin FXOPTION |
| `BAPI_FTR_KNOCKOUT_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Knockout FXOPTIONS |
| `BAPI_FTR_REVERSE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Reverse FX Option |
| `BAPI_FTR_ROLLOVER` | `FTR_BUS2042` | Roll Over Financial Transaction |
| `BAPI_FTR_SEOPTION_GETDETAIL` | `FTR_BAPI_SEOPTIONS` | Details on FX Options |
| `BAPI_FTR_SEOPTION_PREP_STRUC` | `FTR_BAPI_SEOPTIONS` | Determine Changed Fields for FX Options |
| `BAPI_FTR_SETTLE_SEOPTIONS` | `FTR_BAPI_SEOPTIONS` | Cancel FX OPTION |
| `BAPI_FTR_TERMINATE` | `FTR_BUS2042` | Terminate Financial Transaction |
| `BAPI_JBD_GETR_ALL_GET_MULT` | `JBD_GETR_BAPI` | Grouping of Transaction and Financial Object |
| `BAPI_JBD_GETR_FO_GET_DET_MULT` | `JBD_GETR_BAPI` | Generic Transaction:  Get Detail Multiple for Financial Objects |
| `BAPI_JBD_GETR_GET_DET_MULT` | `JBD_GETR_BAPI` | Generic Transaction: Get Detail Multiple |
| `BAPI_JBD_GETR_GET_LIST` | `JBD_GETR_BAPI` | Generic Transaction: Get List |
| `BAPI_JBD_LMB_GET_DET_MULT` | `JBD_LM_BAPI` | Limitvorgaben für BA: GetDetail BAPI |
| `BAPI_JBD_LM_GET_DET_MULT` | `JBD_LM_BAPI` | Limitvorgaben: GetDetail BAPI |
| `BAPI_JBD_LM_GET_LIST` | `JBD_LM_BAPI` | Limitvorgaben: GetList BAPI |
| `BAPI_JBD_MDFX_GET_DET_MULT` | `JBD_MDFX_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDFX_GET_LIST` | `JBD_MDFX_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDIR_GET_DET_MULT` | `JBD_MDIR_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDIR_GET_LIST` | `JBD_MDIR_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDIX_GET_DET_MULT` | `JBD_MDIX_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDIX_GET_LIST` | `JBD_MDIX_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDSE_GET_DET_MULT` | `JBD_MDSE_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDSE_GET_LIST` | `JBD_MDSE_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDVOFX_GET_DET_MULT` | `JBD_MDVO_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDVOFX_GET_LIST` | `JBD_MDVO_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDVOIR_GET_DET_MULT` | `JBD_MDVO_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDVOIR_GET_LIST` | `JBD_MDVO_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDVOIX_GET_DET_MULT` | `JBD_MDVO_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDVOIX_GET_LIST` | `JBD_MDVO_BAPI` | Get-List BAPI |
| `BAPI_JBD_MDVOSE_GET_DET_MULT` | `JBD_MDVO_BAPI` | Get Detail BAPI |
| `BAPI_JBD_MDVOSE_GET_LIST` | `JBD_MDVO_BAPI` | Get-List BAPI |
| `BAPI_TPM_TREA_CF_STAT_IMPORT` | `TPM_TREA_CF_STAT_UPLOAD` | RFC for Upload of Statement Items |

### FI BAPIs not in `RODIR` (31)

| BAPI | Component | Description |
|---|---|---|
| `BAPI_ACCSTMT_CREATEFROMBALANCE` | `FI-BL-PT` | Store account balance/check debit information |
| `BAPI_ACCSTMT_CREATEFROMLOCKBOX` | `FI-BL-PT` | Create lockbox data |
| `BAPI_ACCSTMT_CREATEFROMPREVDAY` | `FI-BL-PT` | Create Bank Statement/Day-End Statement |
| `BAPI_ACCSTMT_CREATEFROMSAMEDAY` | `FI-BL-PT` | Create Bank Statement/Today's Data |
| `BAPI_ACC_ASSET_ACQ_SETT_CHECK` | `AC-INT` | RW: Anlagenzugang mit Aktivierungswertermittlung synchron [de] |
| `BAPI_ACC_ASSET_ACQ_SETT_POST` | `AC-INT` | RW: Anlagenzugang mit Aktivierungswertermittlung asynchron [de] |
| `BAPI_ACC_ASS_ACQUISITION_CHECK` | `AC-INT` | BAPI: Anlagenzugang prüfen [de] |
| `BAPI_ACC_ASS_INTRA_TRANS_CHECK` | `AC-INT` | Rechnungswesen: Anlagentransfer buchen [de] |
| `BAPI_ACC_ASS_POSTCAP_CHECK` | `AC-INT` | BAPI: Nachaktivierung prüfen [de] |
| `BAPI_ACC_ASS_RETIREMENT_CHECK` | `AC-INT` | BAPI: Anlagenabgang prüfen [de] |
| `BAPI_ACC_ASS_TRANSFER_CHECK` | `AC-INT` | Rechnungswesen: Anlagentransfer buchen [de] |
| `BAPI_ACC_ASS_TRANSFER_POST` | `AC-INT` | Rechnungswesen: Anlagentransfer buchen [de] |
| `BAPI_ACC_ASS_TRANS_RET_CHECK` | `AC-INT` | Rechnungswesen: Anlagentransfer buchen [de] |
| `BAPI_ACC_AUC_ACQUISITION_CHECK` | `AC-INT` | Rechnungswesen: Anlagenzugang aus Abrechnung [de] |
| `BAPI_ACC_AUC_ACQUISITION_POST` | `AC-INT` | Rechnungswesen: Anlagenzugang aus Abrechnung [de] |
| `BAPI_ACC_DOCUMENT_RECORD` | `FI` | Accounting: Follow-on Document Numbers for Source Document |
| `BAPI_ACC_POST_STAT_KEYFIGURE` | `FI-GL-GL` | Verbuchen von stat. Kennzahlen [de] |
| `BAPI_CCODE_GET_FIRSTDAY_PERIOD` | `FI` | For Company Code: First Day of Period |
| `BAPI_CCODE_GET_LASTDAY_FYEAR` | `FI` | For Company Code: Last Day of Fiscal Year |
| `BAPI_DEBTOR_CHANGEPASSWORD` | `FI-AR-AR` | Change Customer Password |
| `BAPI_DEBTOR_CHECKPASSWORD` | `FI-AR-AR` | Check Customer Password |
| `BAPI_DEBTOR_CREATE_PW_REG` | `FI-AR-AR` | Create Entry for Customer Password |
| `BAPI_DEBTOR_DELETE_PW_REG` | `FI-AR-AR` | Delete Customer Password Entry |
| `BAPI_DEBTOR_EXISTENCECHECK` | `FI-AR-AR` | Check Customer Existence |
| `BAPI_DEBTOR_GETDETAIL` | `FI-AR-AR` | Customer Detail Information |
| `BAPI_DEBTOR_GET_PW_REG` | `FI-AR-AR` | Read entry for customer password |
| `BAPI_DEBTOR_INITPASSWORD` | `FI-AR-AR` | Initialize Customer Password |
| `BAPI_FAGL_PLANNING_READ` | `FI-GL-GL` | Read In Data |
| `BAPI_GL_GETGLACCBALANCE` | `FI-GL-GL-N` | Closing balance of G/L account for chosen year |
| `BAPI_GL_GETGLACCCURRENTBALANCE` | `FI-GL-GL-N` | Closing balance of G/L account for current year |
| `BAPI_GL_GETGLACCPERIODBALANCES` | `FI-GL-GL-N` | Posting period balances for each G/L account |

## Modern released APIs present on this system

Separate from the BAPIs: the OData services SAP ships for these components, as installed on DS4.
These are the `API_*` services that the SAP Business Accelerator Hub documents, so their presence
here is the on-system counterpart of the Hub listing.

### TRM - 2 `API_*` services

| Service | Object type | Component |
|---|---|---|
| `API_FINTRANSACTIONNPV` | SRVB/SRVD | `FIN-FSCM-TRM-MR` |
| `API_FINTRANSINTRSTRATEINSTR` | SRVB/SRVD | `FIN-FSCM-TRM-TM-TR` |

TRM also carries 61 non-`API_*` services (largely `IWSV` Fiori back-end services):
`A_TRSYPOSFLOW_CDS                  0001`, `A_TRSYPOSTGJRNLENTRITM_CDS         0001`, `C_BALSHTEXPSRSNPSHTHDGOVW_CDS      0001`, `C_BANKGUARANTEEOVERVIEWQRY_CDS     0001`, `C_CASHPOSITIONOVERVIEW_CDS         0001`, `C_CREDITLINEUTILQRY_CDS            0001`, `C_CURRENCYPAIREXCHANGERATE_CDS     0001`, `C_DEBTINVESTMENTNOMINAL_CDS        0001`, `C_DEBTINVMTREFINTEREST_CDS         0001`, `C_FINANCIALPOSITIONQUERY_CDS       0001`, `C_FINANCIALSTATUSQUERY_2_CDS       0001`, `C_FINANCIALSTATUSQUERY_CDS         0001`, `C_FINTRANSACTIONMANAGE_CDS         0001`, `C_FINTRANSAMTQRY_CDS               0001`, `C_FINTRANSBUSVOLBANKGRPQRY_CDS     0001`, `C_FINTRANSFCSTHISTLFEEQRY_CDS      0001`, `C_FINTRANSSINGLEDAYAMTQRY_CDS      0001`, `C_FINTRANSWRKFLWMYINBOX_CDS        0001`, `C_FTR_CL_KEYDATE_UTIL_Q_CDS        0001`, `C_FTR_CL_UTIL_ANALYTICS_CDS        0001`, `C_FXFORWARDNOMINAL_CDS             0001`, `C_FXOPTIONNOMINAL_CDS              0001`, `C_FXSPOTRATEDEVIATION_CDS          0001`, `C_FXSPOTRATEHISTORY_CDS            0001`, `C_FXSWAPRATEKEYDATE_CDS            0001`, `C_HISEXCHRATEVOLATILITYQRY_CDS     0001`, `C_HISSCRTYPRCVOLATILITYQRY_CDS     0001`, `C_HISTFINANCIALSTATUSQRY_2_CDS     0001`, `C_HISTFINANCIALSTATUSQUERY_CDS     0001`, `C_HISTINTRATEVOLATILITYQRY_CDS     0001`, `C_INTRSTRATESWAPNOMINAL_CDS        0001`, `C_LQDYFORECASTOVERVIEW_CDS         0001`, `C_MATURITYPROFILEQUERY_CDS         0001`, `C_MKTDATABASISSPREADQRY_CDS        0001`, `C_MKTDATACREDITSPREADQRY_CDS       0001`, `C_MKTDATAFXRATEQUERY_CDS           0001`, `C_MKTDATAIMPVOLATILITYQRY_CDS      0001`, `C_MKTDATAREFINTRSTRATEQRY_CDS      0001`, `C_MKTDATAREFINTRSTRATERPTG_CDS     0001`, `C_NONDELIVERABLEFWDNOMINAL_CDS     0001`...

### FI - 44 `API_*` services

| Service | Object type | Component |
|---|---|---|
| `API_BANKACCOUNT_SRV                0001` | IWSV | `FI-GL-IS` |
| `API_BUSINESSAREA_SRV               0001` | IWSV | `FI-GL-IS` |
| `API_CASHFLOWITEMBASIC_SRV          0001` | IWSV | `FI-GL-IS` |
| `API_CERTAINTYLEVEL_SRV             0001` | IWSV | `FI-GL-IS` |
| `API_CHARTOFACCOUNTS_SRV            0001` | IWSV | `FI-GL-IS` |
| `API_COMPANYCODE_SRV                0001` | IWSV | `FI-GL-IS` |
| `API_CONTROLLINGAREA_SRV            0001` | IWSV | `FI-GL-IS` |
| `API_CONTROLLINGDEBITCREDITCODE_SRV 0001` | IWSV | `FI-GL-IS` |
| `API_COSTCENTERACTIVITYTYPE_SRV     0001` | IWSV | `FI-GL-IS` |
| `API_COSTCENTER_SRV                 0001` | IWSV | `FI-GL-IS` |
| `API_COUNTRY_SRV                    0001` | IWSV | `FI-GL-IS` |
| `API_CUSTOMERGROUP_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_CUSTOMERSUPPLIERINDUSTRY_SRV   0001` | IWSV | `FI-GL-IS` |
| `API_DISTRIBUTIONCHANNEL_SRV        0001` | IWSV | `FI-GL-IS` |
| `API_DIVISION_SRV                   0001` | IWSV | `FI-GL-IS` |
| `API_FINCOPBALANCEINFO_SRV          0001` | IWSV | `FI-GL-IS` |
| `API_FINPROJECT_SRV                 0001` | IWSV | `FI-GL-IS` |
| `API_FINWBSELEMENT_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_FIXEDASSETUSAGEOBJECT` | SRVB/SRVD | `FI-AA` |
| `API_FUNCTIONALAREA_SRV             0001` | IWSV | `FI-GL-IS` |
| `API_GLACCOUNTINCHARTOFACCOUNTS_SRV 0001` | IWSV | `FI-GL-IS` |
| `API_INTERNALORDER_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_LEDGER_SRV                     0001` | IWSV | `FI-GL-IS` |
| `API_LIQUIDITYITEM_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_MANUALACCRUALS` | SRVB/SRVD | `FI-GL-GL-AAC` |
| `API_MANUALACCRUALS                 0001` | IWSV | `FI-GL-GL-AAC` |
| `API_OPLACCTGDOCITEMCUBE_SRV        0001` | IWSV | `FI-GL-IS` |
| `API_PARTNERCOMPANY_SRV             0001` | IWSV | `FI-GL-IS` |
| `API_PAYMENTADVICE` | SRVB/SRVD | `FI-AR-AR` |
| `API_PAYMENTDIFFERENCEREASON_SRV_01 0001` | IWSV | `FI-AR-IS` |
| `API_PAYMENT_METHOD_VALIDATION_SRV  0001` | IWSV | `FI-AP-AP-M` |
| `API_PAYROLLREVERSALACCTGNOTIF` | SRVD | `FI-GL-BTI` |
| `API_PLANNINGCATEGORY_SRV           0001` | IWSV | `FI-GL-IS` |
| `API_PLANNINGLEVEL_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_PLANT_SRV                      0001` | IWSV | `FI-GL-IS` |
| `API_PRODUCTGROUP_SRV               0001` | IWSV | `FI-GL-IS` |
| `API_PROFITCENTER_SRV               0001` | IWSV | `FI-GL-IS` |
| `API_PROJECT_SRV                    0001` | IWSV | `FI-GL-IS` |
| `API_PYRLACCOUNTINGNOTIFICATION` | SRVB/SRVD | `FI-GL-BTI` |
| `API_REVERSALACCOUNTINGNOTIF` | SRVD | `FI-GL-BTI` |
| `API_SALESDISTRICT_SRV              0001` | IWSV | `FI-GL-IS` |
| `API_SALESORGANIZATION_SRV          0001` | IWSV | `FI-GL-IS` |
| `API_SEGMENT_SRV                    0001` | IWSV | `FI-GL-IS` |
| `API_WBSELEMENT_SRV                 0001` | IWSV | `FI-GL-IS` |

Plus 198 non-`API_*` services in the same components.

`SRVD`/`SRVB` are RAP service definitions and bindings (OData V4-era); `IWSV` entries are classic
OData V2 gateway services. Both are published APIs; the object type tells you which stack.

## Official SAP references

**These pages were not machine-read.** `help.sap.com` and `api.sap.com` are JavaScript applications
that return an empty shell to a scripted fetch, so the numbers in this document come from the system,
not from them. Open these in a browser to verify a specific API:

| Reference | What it is good for |
|---|---|
| [SAP Business Accelerator Hub](https://api.sap.com/) | The authoritative catalogue of published SAP APIs - OData/SOAP metadata, EDMX, sandbox. Search a service name from the tables above. |
| [APIs for Treasury and Risk Management (SAP Help)](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f9fdf9f460a340d2b96c9aef284251d9/325f953a5fb54319921538882b015b5a.html) | Filterable table of every TRM API. **Note: written for S/4HANA Cloud** - DS4 is on-premise, so treat it as a superset and confirm against the on-system list above. |
| [APIs on SAP Business Accelerator Hub - on-premise](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/8308e6d301d54584a33cd04a9861bc52/1e60f14bdc224c2c975c8fa8bcfd7f3f.html) | The on-premise equivalent, which is the edition DS4 runs. |
| [Finding Released APIs and Deprecated Objects (ADT guide)](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/finding-released-apis-and-deprecated-objects) | SAP's own procedure for checking the **C1 release contract** per object in ADT - the gap this document cannot close from the DDIC. |
| Transaction `BAPI` (BAPI Explorer) on DS4 | SAP's in-system BAPI catalogue, organised by business object; shows the release status the `RODIR` flag reflects. |

For a BAPI, the in-system checks are cheaper and more current than any web page: `RODIR` (captured
here), the object's ADT properties, and transaction `BAPI`.
