# FI BAPI signatures

Every parameter of every BAPI in scope, from `FUPARAREF` (active version) on DS4/100, 2026-09-14.
`Type` is the DDIC reference exactly as the interface declares it — `STRUCTURE` for a whole
structure, `STRUCTURE-FIELD` when the parameter is typed from a single field.
Field lists for every structure named here are in [`json/structures.json`](json/structures.json).

## `BAPI_ACCSTMT_CREATEFROMBALANCE`

Store account balance/check debit information

- Function group `4499` · package `FTE` · component `FI-BL-PT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BANK_ACCOUNT` | `BAPI4499_0` |  |  |
| IMPORTING | `STMT_ADDAMOUNTS` | `BAPI4499_4` |  |  |
| IMPORTING | `TESTRUN` | `TESTRUN` | ✓ |  |
| EXPORTING | `STMT_KEY` | `BF_KUKEYEB` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION3` | `BAPIEXT` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |

## `BAPI_ACCSTMT_CREATEFROMLOCKBOX`

Create lockbox data

- Function group `4499` · package `FTE` · component `FI-BL-PT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BANK_ACCOUNT` | `BAPI4499_0` |  |  |
| IMPORTING | `STMT_HEADER` | `BAPI4499_1` |  |  |
| IMPORTING | `TESTRUN` | `TESTRUN` | ✓ |  |
| EXPORTING | `STMT_KEY` | `BF_KUKEYEB` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION3` | `BAPIEXT` | ✓ |  |
| TABLES | `LBX_INV_INFO` | `BAPI4499_6` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |
| TABLES | `STMT_ITEM` | `BAPI4499_2` | ✓ |  |

## `BAPI_ACCSTMT_CREATEFROMPREVDAY`

Create Bank Statement/Day-End Statement

- Function group `4499` · package `FTE` · component `FI-BL-PT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BANK_ACCOUNT` | `BAPI4499_0` |  |  |
| IMPORTING | `STMT_HEADER` | `BAPI4499_1` |  |  |
| IMPORTING | `TESTRUN` | `TESTRUN` | ✓ |  |
| EXPORTING | `STMT_KEY` | `BF_KUKEYEB` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION3` | `BAPIEXT` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |
| TABLES | `STMT_ITEM` | `BAPI4499_2` | ✓ |  |
| TABLES | `STMT_TEXT_ITEM` | `BAPI4499_3` | ✓ |  |

## `BAPI_ACCSTMT_CREATEFROMSAMEDAY`

Create Bank Statement/Today's Data

- Function group `4499` · package `FTE` · component `FI-BL-PT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BANK_ACCOUNT` | `BAPI4499_0` |  |  |
| IMPORTING | `STMT_ADDAMOUNTS` | `BAPI4499_4` |  |  |
| IMPORTING | `STMT_HEADER` | `BAPI4499_1` |  |  |
| IMPORTING | `TESTRUN` | `TESTRUN` | ✓ |  |
| EXPORTING | `STMT_KEY` | `BF_KUKEYEB` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIEXT` | ✓ |  |
| TABLES | `EXTENSION3` | `BAPIEXT` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |
| TABLES | `STMT_ITEM` | `BAPI4499_2` | ✓ |  |
| TABLES | `STMT_TEXT_ITEM` | `BAPI4499_3` | ✓ |  |

## `BAPI_ACC_ASSET_ACQ_SETT_CHECK`

RW: Anlagenzugang mit Aktivierungswertermittlung synchron [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| EXPORTING | `IT_ACCOUNTING_DOC` | `IF_FAA_POSTING_CORE_TYPES=>TY_T_ACCOUNTING_DOC` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` |  |  |
| TABLES | `ACQUISITION_AND_ORIGIN` | `BAPIACAM14` |  |  |
| TABLES | `ACQUISITION_RESULT_INTERNAL` | `BAPIACAM24_INTERNAL` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_ASSET_ACQ_SETT_POST`

RW: Anlagenzugang mit Aktivierungswertermittlung asynchron [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` |  |  |
| TABLES | `ACQUISITION_AND_ORIGIN` | `BAPIACAM14` |  |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_ASS_ACQUISITION_CHECK`

BAPI: Anlagenzugang prüfen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE31` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` | ✓ |  |
| TABLES | `ACQGROSSAREAVALUES` | `BAPIACAM22` | ✓ |  |
| TABLES | `ACQUISITIONDATA` | `BAPIACAM13` |  |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_ASS_INTRA_TRANS_CHECK`

Rechnungswesen: Anlagentransfer buchen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSACQUISITIONDATA` | `BAPIACAM11_UMB` |  |  |
| TABLES | `TRANSRETAREAVALUES` | `BAPIACAM20_UMB` | ✓ |  |
| TABLES | `TRANSRETIREMENTDATA` | `BAPIACAM10_UMB` |  |  |

## `BAPI_ACC_ASS_POSTCAP_CHECK`

BAPI: Nachaktivierung prüfen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE31` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `POSTCAPAREAVALUES` | `BAPIACAM23` | ✓ |  |
| TABLES | `POSTCAPITALIZATION` | `BAPIACAM15` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_ASS_RETIREMENT_CHECK`

BAPI: Anlagenabgang prüfen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE31` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` |  |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETIREMENTAREAVALUES` | `BAPIACAM20` | ✓ |  |
| TABLES | `RETIREMENTDATA` | `BAPIACAM12` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_ASS_TRANSFER_CHECK`

Rechnungswesen: Anlagentransfer buchen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CALLED_FROM_WORKFLOW` | `XFELD` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSACQUISITIONDATA` | `BAPIACAM11` |  |  |
| TABLES | `TRANSRETAREAVALUES` | `BAPIACAM20` | ✓ |  |
| TABLES | `TRANSRETIREMENTDATA` | `BAPIACAM10` |  |  |

## `BAPI_ACC_ASS_TRANSFER_POST`

Rechnungswesen: Anlagentransfer buchen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CALLED_FROM_WORKFLOW` | `XFELD` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSACQUISITIONDATA` | `BAPIACAM11` |  |  |
| TABLES | `TRANSRETAREAVALUES` | `BAPIACAM20` | ✓ |  |
| TABLES | `TRANSRETIREMENTDATA` | `BAPIACAM10` |  |  |

## `BAPI_ACC_ASS_TRANS_ACQ_CHECK`

Accounting: Check acquisition from transfer

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSACQUISITIONDATA` | `BAPIACAM11` |  |  |
| TABLES | `TRANSALLOCATIONDATA` | `BAPIACAM04` | ✓ |  |
| TABLES | `TRANSGLOBALAREADATA` | `BAPIACAM08` | ✓ |  |
| TABLES | `TRANSGLOBAREAVALUES` | `BAPIACAM21` |  |  |
| TABLES | `TRANSINSURANCEDATA` | `BAPIACAM07` | ✓ |  |
| TABLES | `TRANSMASTERRECDATA` | `BAPIACAM06` | ✓ |  |

## `BAPI_ACC_ASS_TRANS_ACQ_POST`

Accounting: Post acquisition from transfer

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE30-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE30-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE30-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSACQUISITIONDATA` | `BAPIACAM11` |  |  |
| TABLES | `TRANSALLOCATIONDATA` | `BAPIACAM04` | ✓ |  |
| TABLES | `TRANSGLOBALAREADATA` | `BAPIACAM08` | ✓ |  |
| TABLES | `TRANSGLOBAREAVALUES` | `BAPIACAM21` |  |  |
| TABLES | `TRANSINSURANCEDATA` | `BAPIACAM07` | ✓ |  |
| TABLES | `TRANSMASTERRECDATA` | `BAPIACAM06` | ✓ |  |

## `BAPI_ACC_ASS_TRANS_RET_CHECK`

Rechnungswesen: Anlagentransfer buchen [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CALLED_FROM_WORKFLOW` | `XFELD` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL30` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR30` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRANSRETAREAVALUES` | `BAPIACAM20` | ✓ |  |
| TABLES | `TRANSRETIREMENTDATA` | `BAPIACAM10` |  |  |

## `BAPI_ACC_AUC_ACQUISITION_CHECK`

Rechnungswesen: Anlagenzugang aus Abrechnung [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SETTLEMENTAREAVALUES` | `BAPIACAM21` |  |  |
| TABLES | `SETTLEMENTGLOBALAREADATA` | `BAPIACAM08` | ✓ |  |
| TABLES | `SETTLEMENTORIGINDATA` | `BAPIACAM_ANLK` | ✓ |  |
| TABLES | `SETTLEMENTPOSTINGDATA` | `BAPIACAM14_AUC` |  |  |

## `BAPI_ACC_AUC_ACQUISITION_POST`

Rechnungswesen: Anlagenzugang aus Abrechnung [de]

- Function group `ACC5` · package `ACID` · component `AC-INT`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE30` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL31` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SETTLEMENTAREAVALUES` | `BAPIACAM21` |  |  |
| TABLES | `SETTLEMENTORIGINDATA` | `BAPIACAM_ANLK` | ✓ |  |
| TABLES | `SETTLEMENTPOSTINGDATA` | `BAPIACAM14_AUC` |  |  |

## `BAPI_ACC_BILLING_CHECK`

Accounting: Check Billing Doc. (OAG: LOAD RECEIVABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA00` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE01` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL01` |  |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR01` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` | ✓ |  |
| TABLES | `SALESORDER` | `BAPIACSO00` | ✓ |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_BILLING_POST`

Accounting: Post Invoice (OAG: LOAD RECEIVABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA00` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE01` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE01-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE01-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE01-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL01` |  |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR01` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` | ✓ |  |
| TABLES | `SALESORDER` | `BAPIACSO00` | ✓ |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_BILLING_REV_CHECK`

Accounting: Check Billing Document Reversal (OAG: LOAD RECEIVABLE)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_BILLING_REV_POST`

Accounting: Post Billing Doc.Reversal (OAG: LOAD RECEIVABLE)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACREV-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACREV-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACREV-OBJ_TYPE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_DOCUMENTS_RECORD`

Follow-On Document Numbers in Accounting for Multiple Source Documents

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| TABLES | `ACCOUNTING_DOCUMENTS` | `BAPIACDOCRECEIVER` | ✓ |  |
| TABLES | `EXTERNAL_DOCUMENTS` | `BAPIACDOCKEY` |  |  |
| TABLES | `NO_ACCOUNTING_DOCUMENTS` | `BAPIACDOCKEY` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |

## `BAPI_ACC_DOCUMENT_CHECK`

Accounting: Check

- Function group `ACC9` · package `ACID_PI` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CONTRACTHEADER` | `BAPIACCAHD` | ✓ |  |
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA09` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE09` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL09` | ✓ |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP09` | ✓ |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR09` | ✓ |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX09` | ✓ |  |
| TABLES | `ACCOUNTWT` | `BAPIACWT09` | ✓ |  |
| TABLES | `CONTRACTITEM` | `BAPIACCAIT` | ✓ |  |
| TABLES | `CRITERIA` | `BAPIACKEC9` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR09` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIACEXTC` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIPAREX` | ✓ |  |
| TABLES | `PAYMENTCARD` | `BAPIACPC09` | ✓ |  |
| TABLES | `REALESTATE` | `BAPIACRE09` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEV9` | ✓ |  |

## `BAPI_ACC_DOCUMENT_DISPLAY`

Accounting: Display Method for Follow-On Document Display

- Function group `RWCL` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `OBJ_KEY` | `BAPIACHE01-OBJ_KEY` |  |  |
| IMPORTING | `OBJ_SYS` | `BAPIACHE01-OBJ_SYS` |  |  |
| IMPORTING | `OBJ_TYPE` | `BAPIACHE01-OBJ_TYPE` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_DOCUMENT_POST`

Accounting: Posting

- Function group `ACC9` · package `ACID_PI` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CONTRACTHEADER` | `BAPIACCAHD` | ✓ |  |
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA09` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE09` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE09-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE09-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE09-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL09` | ✓ |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP09` | ✓ |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR09` | ✓ |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX09` | ✓ |  |
| TABLES | `ACCOUNTWT` | `BAPIACWT09` | ✓ |  |
| TABLES | `CONTRACTITEM` | `BAPIACCAIT` | ✓ |  |
| TABLES | `CRITERIA` | `BAPIACKEC9` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR09` |  |  |
| TABLES | `EXTENSION1` | `BAPIACEXTC` | ✓ |  |
| TABLES | `EXTENSION2` | `BAPIPAREX` | ✓ |  |
| TABLES | `PAYMENTCARD` | `BAPIACPC09` | ✓ |  |
| TABLES | `REALESTATE` | `BAPIACRE09` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEV9` | ✓ |  |

## `BAPI_ACC_DOCUMENT_RECORD`

Accounting: Follow-on Document Numbers for Source Document

- Function group `RWCL` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `OBJ_KEY` | `BAPIACHE01-OBJ_KEY` |  |  |
| IMPORTING | `OBJ_SYS` | `BAPIACHE01-OBJ_SYS` |  |  |
| IMPORTING | `OBJ_TYPE` | `BAPIACHE01-OBJ_TYPE` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RECEIVER` | `BAPIACDONR` |  |  |

## `BAPI_ACC_DOCUMENT_REV_CHECK`

Accounting: Check Reversal

- Function group `ACC9` · package `ACID_PI` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BUS_ACT` | `BAPIACHE09-BUS_ACT` |  |  |
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_DOCUMENT_REV_POST`

Accounting: Post Reversal

- Function group `ACC9` · package `ACID_PI` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BUS_ACT` | `BAPIACHE09-BUS_ACT` |  |  |
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACREV-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACREV-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACREV-OBJ_TYPE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_EMPLOYEE_EXP_CHECK`

Accounting: Check G/L acct assignment for HR posting (OAG:POST JOURNAL)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE04` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL04` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_EMPLOYEE_EXP_POST`

Accounting: Post G/L account assignment for HR posting (OAG:POST JOURNAL)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE04` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE04-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE04-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE04-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL04` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_EMPLOYEE_PAY_CHECK`

Accounting: Check Vendor Acct Assignment for HR Posting (OAG:LOAD PAYABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE06` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL06` |  |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP06` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_EMPLOYEE_PAY_POST`

Accounting: Post Vendor Acct Assignment for HR Posting (OAG: LOAD PAYABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE06` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE06-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE06-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE06-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL06` |  |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP06` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_EMPLOYEE_REC_CHECK`

Accounting: Check Cust. Acct Assignmt for HR Posting (OAG:LOAD RECEIVABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE05` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL05` |  |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR05` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_EMPLOYEE_REC_POST`

FI/CO: Post Customer Acct Assignment for HR Posting (OAG: LOAD RECEIVABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE05` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE05-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE05-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE05-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL05` |  |  |
| TABLES | `ACCOUNTRECEIVABLE` | `BAPIACAR05` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR04` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` | ✓ |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` | ✓ |  |

## `BAPI_ACC_GL_POSTING_CHECK`

Accounting: General G/L Account Posting

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE08` | ✓ |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL08` |  |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR08` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_GL_POSTING_POST`

Accounting: General G/L Account Posting

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE08` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE02-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE02-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE02-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL08` |  |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR08` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_GL_POSTING_REV_CHECK`

Accounting: Check Reversal of General G/L Account Posting

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_GL_POSTING_REV_POST`

Accounting: Post General G/L Posting Reversal

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACREV-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACREV-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACREV-OBJ_TYPE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_GOODS_MOVEMENT_CHECK`

Accounting: Check Goods Movement (OAG: POST JOURNAL)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE02` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL02` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` | ✓ |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_GOODS_MOVEMENT_POST`

Accounting: Post Goods Movement (OAG: POST JOURNAL)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE02` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE02-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE02-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE02-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL02` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` | ✓ |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_GOODS_MOV_REV_CHECK`

Accounting: Check Goods Movement Reversal (OAG: POST JOURNAL)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_GOODS_MOV_REV_POST`

Accounting: Post Goods Movement Reversal (OAG: POST JOURNAL)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACREV-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACREV-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACREV-OBJ_TYPE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_INVOICE_RECEIPT_CHECK`

Accounting: Check Invoice Receipt (OAG: LOAD PAYABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA00` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE03` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL03` |  |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP03` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` | ✓ |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` | ✓ |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_INVOICE_RECEIPT_POST`

Accounting: Post Invoice Receipt (OAG: LOAD PAYABLE)

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CUSTOMERCPD` | `BAPIACPA00` | ✓ |  |
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE03` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACHE03-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACHE03-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACHE03-OBJ_TYPE` |  |  |
| TABLES | `ACCOUNTGL` | `BAPIACGL03` |  |  |
| TABLES | `ACCOUNTPAYABLE` | `BAPIACAP03` |  |  |
| TABLES | `ACCOUNTTAX` | `BAPIACTX01` |  |  |
| TABLES | `CRITERIA` | `BAPIACKECR` | ✓ |  |
| TABLES | `CURRENCYAMOUNT` | `BAPIACCR01` |  |  |
| TABLES | `EXTENSION1` | `BAPIEXTC` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` | ✓ |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `VALUEFIELD` | `BAPIACKEVA` | ✓ |  |

## `BAPI_ACC_INVOICE_REV_CHECK`

Accounting: Check Reversal of Invoice Receipt (OAG: LOAD PAYABLE)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_INVOICE_REV_POST`

Accounting: Post Invoice Receipt Reversal (OAG: LOAD PAYABLE)

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REVERSAL` | `BAPIACREV` |  |  |
| EXPORTING | `OBJ_KEY` | `BAPIACREV-OBJ_KEY` |  |  |
| EXPORTING | `OBJ_SYS` | `BAPIACREV-OBJ_SYS` |  |  |
| EXPORTING | `OBJ_TYPE` | `BAPIACREV-OBJ_TYPE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_POST_STAT_KEYFIGURE`

Verbuchen von stat. Kennzahlen [de]

- Function group `FAGL_SKF_BAPI` · package `FAGL_STATKEYFIGURE` · component `FI-GL-GL`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIFAGLSKF01` |  |  |
| TABLES | `EXTENSION1` | `BAPIFAGLSKF03` |  |  |
| TABLES | `LINEDATA` | `BAPIFAGLSKF02` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PURCHASE_ORDER_CHECK`

Accounting: Check Purchase Order

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` | ✓ |  |
| IMPORTING | `SRM_INTERNAL` | `BOOLEAN` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` |  |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` |  |  |
| TABLES | `PURCHASEREQUI` | `BAPIACPR00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PURCHASE_ORDER_POST`

Accounting: Post Purchase Order

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` | ✓ |  |
| IMPORTING | `SRM_INTERNAL` | `BOOLEAN` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` |  |  |
| TABLES | `PURCHASEORDER` | `BAPIACPO00` |  |  |
| TABLES | `PURCHASEREQUI` | `BAPIACPR00` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PURCHASE_REQUI_CHECK`

Accounting: Check Purchase Requisition

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` | ✓ |  |
| IMPORTING | `PRE_POST_CALL` | `BOOLEAN` | ✓ |  |
| IMPORTING | `SRM_INTERNAL` | `BOOLEAN` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` |  |  |
| TABLES | `PURCHASEREQUI` | `BAPIACPR00` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PURCHASE_REQUI_POST`

Accounting: Post Purchase Requisition

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` | ✓ |  |
| IMPORTING | `SRM_INTERNAL` | `BOOLEAN` | ✓ |  |
| TABLES | `PURCHASEAMOUNT` | `BAPIACCRPO` |  |  |
| TABLES | `PURCHASEREQUI` | `BAPIACPR00` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PYMNTBLK_UPDATE_CHECK`

Accounting: Check Changes to Payment Block for Open Items

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REFERENCEINV` | `BAPIACPMBLK` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_PYMNTBLK_UPDATE_POST`

Accounting: Post Changes to Payment Block for Open Items

- Function group `ACC6` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REFERENCEINV` | `BAPIACPMBLK` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_ACC_SALES_ORDER_CHECK`

Accounting: Check Sales Order

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` |  |  |
| TABLES | `SALESCRITERIA` | `BAPIACSOKECR` | ✓ |  |
| TABLES | `SALESORDER` | `BAPIACSO00` |  |  |
| TABLES | `SALESQUOTATION` | `BAPIACSQ00` | ✓ |  |
| TABLES | `SALESVALUEFIELD` | `BAPIACSOKEVA` | ✓ |  |

## `BAPI_ACC_SALES_ORDER_POST`

Accounting: Post Sales Order

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` |  |  |
| TABLES | `SALESCRITERIA` | `BAPIACSOKECR` | ✓ |  |
| TABLES | `SALESORDER` | `BAPIACSO00` |  |  |
| TABLES | `SALESQUOTATION` | `BAPIACSQ00` | ✓ |  |
| TABLES | `SALESVALUEFIELD` | `BAPIACSOKEVA` | ✓ |  |

## `BAPI_ACC_SALES_QUOTA_CHECK`

Accounting: Check Customer Quotation

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` |  |  |
| TABLES | `SALESQUOTATION` | `BAPIACSQ00` |  |  |

## `BAPI_ACC_SALES_QUOTA_POST`

Accounting: Post Customer Quotation

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `SALESAMOUNT` | `BAPIACCRSO` |  |  |
| TABLES | `SALESQUOTATION` | `BAPIACSQ00` |  |  |

## `BAPI_ACC_TRAVEL_CHECK`

Accounting: Check Trip

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` |  |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` |  |  |

## `BAPI_ACC_TRAVEL_POST`

Accounting: Post Trip

- Function group `ACC4` · package `ACID` · component `AC-INT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DOCUMENTHEADER` | `BAPIACHE07` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TRAVEL` | `BAPIACTR00` |  |  |
| TABLES | `TRAVELAMOUNT` | `BAPIACCRPO` |  |  |

## `BAPI_AP_ACC_GETBALANCEDITEMS`

Vendor Account Clearing Transactions in a given Period

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `DATE_FROM` | `BAPI3008-FROM_DATE` |  |  |
| IMPORTING | `DATE_TO` | `BAPI3008-TO_DATE` |  |  |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3008_2` |  |  |

## `BAPI_AP_ACC_GETCURRENTBALANCE`

Vendor Account Closing Balance in Current Fiscal Year

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `ACTUAL_BALANCE` | `BAPI3008_9` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_AP_ACC_GETKEYDATEBALANCE`

Vendor Account Balance at Key Date

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BALANCESPGLI` | `BAPI3008-BAL_SGLIND` | ✓ | SPACE |
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `KEYDATE` | `BAPI3008-KEY_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3008-NTDITMS_RQ` | ✓ | SPACE |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `KEYBALANCE` | `BAPI3008_3` |  |  |

## `BAPI_AP_ACC_GETOPENITEMS`

Vendor Account Open Items at a Key Date

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `KEYDATE` | `BAPI3008-KEY_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3008-NTDITMS_RQ` | ✓ | SPACE |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3008_2` |  |  |

## `BAPI_AP_ACC_GETPERIODBALANCES`

Posting Period Balances per Vendor Account in Current Fiscal Year

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `ACTUAL_BALANCE` | `BAPI3008_9` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `CREDITOR_BALANCES` | `BAPI3008_7` |  |  |
| TABLES | `CREDITOR_SPECIAL_BALANCES` | `BAPI3008_A` |  |  |

## `BAPI_AP_ACC_GETSTATEMENT`

Vendor Account Statement for a given Period

- Function group `3008` · package `FBK` · component `FI-AP-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3008_1-COMP_CODE` |  |  |
| IMPORTING | `DATE_FROM` | `BAPI3008-FROM_DATE` |  |  |
| IMPORTING | `DATE_TO` | `BAPI3008-TO_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3008-NTDITMS_RQ` | ✓ | SPACE |
| IMPORTING | `VENDOR` | `BAPI3008_1-VENDOR` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3008_2` |  |  |

## `BAPI_AR_ACC_GETBALANCEDITEMS`

Customer account clearing transactions in a given time period

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| IMPORTING | `DATE_FROM` | `BAPI3007-FROM_DATE` |  |  |
| IMPORTING | `DATE_TO` | `BAPI3007-TO_DATE` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3007_2` |  |  |

## `BAPI_AR_ACC_GETCURRENTBALANCE`

Closing balance of customer account in current fiscal year

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| EXPORTING | `ACTUAL_BALANCE` | `BAPI3007_9` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_AR_ACC_GETKEYDATEBALANCE`

Customer account balance at a key date

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BALANCESPGLI` | `BAPI3007-BAL_SGLIND` | ✓ | SPACE |
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| IMPORTING | `KEYDATE` | `BAPI3007-KEY_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3007-NTDITMS_RQ` | ✓ | SPACE |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `KEYBALANCE` | `BAPI3007_3` |  |  |

## `BAPI_AR_ACC_GETOPENITEMS`

Customer account open items at a key date

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| IMPORTING | `KEYDATE` | `BAPI3007-KEY_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3007-NTDITMS_RQ` | ✓ | SPACE |
| IMPORTING | `SECINDEX` | `BAPI3007-SINDEX_RQ` | ✓ | SPACE |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3007_2` |  |  |

## `BAPI_AR_ACC_GETPERIODBALANCES`

Posting period totals per customer account in current fiscal year

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| EXPORTING | `ACTUAL_BALANCE` | `BAPI3007_9` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `DEBITOR_BALANCES` | `BAPI3007_7` |  |  |
| TABLES | `DEBITOR_SPECIAL_BALANCES` | `BAPI3007_A` |  |  |

## `BAPI_AR_ACC_GETSTATEMENT`

Customer account statement for a given period

- Function group `3007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3007_1-COMP_CODE` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI3007_1-CUSTOMER` |  |  |
| IMPORTING | `DATE_FROM` | `BAPI3007-FROM_DATE` |  |  |
| IMPORTING | `DATE_TO` | `BAPI3007-TO_DATE` |  |  |
| IMPORTING | `NOTEDITEMS` | `BAPI3007-NTDITMS_RQ` | ✓ | SPACE |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `LINEITEMS` | `BAPI3007_2` |  |  |

## `BAPI_ASSET_ACQUISITION_CHECK`

Check asset acquisition

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `ACQUISITIONDATA` | `BAPIFAPO_ACQ` |  |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_PROP` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_ACQUISITION_POST`

Post Asset Acquisition

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `ACQUISITIONDATA` | `BAPIFAPO_ACQ` |  |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_PROP` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_DOWNPAYMENT_CHECK`

Assets: Check Down Payment

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `DOWNPAYMENTDATA` | `BAPIFAPO_DOWNPAYMENT` |  |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_DOWNPAYMENT_POST`

Assets: Post Down Payment

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `DOWNPAYMENTDATA` | `BAPIFAPO_DOWNPAYMENT` |  |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_INV_SUPPORT_CHECK`

Assets: Check Investment Support

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `INVESTMENTSUPPORTDATA` | `BAPIFAPO_INV_SUPPORT` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_PROP` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_INV_SUPPORT_POST`

Assets: Post Investment Support

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `INVESTMENTSUPPORTDATA` | `BAPIFAPO_INV_SUPPORT` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_PROP` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_POSTCAP_CHECK`

Check post-capitalization

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `POSTCAPITALIZATION` | `BAPIFAPO_POSTCAP` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_POST` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_POSTCAP_POST`

Post post-capitalization

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `POSTCAPITALIZATION` | `BAPIFAPO_POSTCAP` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `PROPAREAVALUES` | `BAPIFAPO_AREAVALUES_POST` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_RETIREMENT_CHECK`

Check asset retirement

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `RETIREMENTDATA` | `BAPIFAPO_RET` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_RETIREMENT_POST`

Post asset retirement

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `RETIREMENTDATA` | `BAPIFAPO_RET` | ✓ |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_REVALUATION_CHECK`

Assets: Check Revaluation

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `REVALUATIONDATA` | `BAPIFAPO_REVALUATION` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |
| TABLES | `REVALAREAVALUES` | `BAPIFAPO_AREAVALUES_REVAL` | ✓ |  |

## `BAPI_ASSET_REVALUATION_POST`

Assets: Post Revaluation

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `REVALUATIONDATA` | `BAPIFAPO_REVALUATION` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |
| TABLES | `REVALAREAVALUES` | `BAPIFAPO_AREAVALUES_REVAL` | ✓ |  |

## `BAPI_ASSET_REVERSAL_CHECK`

Check Asset Document Reversal

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPI6037_DOC_REF` | ✓ |  |
| IMPORTING | `ORIGINDOCUMENTKEY` | `BAPI6037_DOC_KEY` | ✓ |  |
| IMPORTING | `REVERSALDATA` | `BAPI6037_REV_DATA` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_REVERSAL_POST`

Post Asset Document Reversal

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPI6037_DOC_REF` | ✓ |  |
| IMPORTING | `ORIGINDOCUMENTKEY` | `BAPI6037_DOC_KEY` | ✓ |  |
| IMPORTING | `REVERSALDATA` | `BAPI6037_REV_DATA` | ✓ |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPI6037_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_SUB_COST_REV_CHECK`

Assets: Check Subsequent Costs and Revenue

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `SUBCOSTREVENUEDATA` | `BAPIFAPO_SUBCOSTREVENUE` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_SUB_COST_REV_POST`

Assets: Post Subsequent Costs and Revenue

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `SUBCOSTREVENUEDATA` | `BAPIFAPO_SUBCOSTREVENUE` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_TRANSFER_CHECK`

Assets: Check Intracompany Transfer

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `TRANSFERPOSTINGDATA` | `BAPIFAPO_TRANSFER_REV_DISTR` |  |  |
| IMPORTING | `TRANSFERTODATA` | `BAPIFAPO_TRANSFER_TO` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_TRANSFER_POST`

Assets: Post Intracompany Transfer

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `TRANSFERPOSTINGDATA` | `BAPIFAPO_TRANSFER_REV_DISTR` |  |  |
| IMPORTING | `TRANSFERTODATA` | `BAPIFAPO_TRANSFER_TO` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_VALUE_ADJUST_CHECK`

Assets: Check Depreciation

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `VALUEADJUSTDATA` | `BAPIFAPO_VALUE_ADJUSTMENT` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `ADJUSTAREAVALUES` | `BAPIFAPO_AREAVALUES` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_VALUE_ADJUST_POST`

Assets: Post Depreciation

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `VALUEADJUSTDATA` | `BAPIFAPO_VALUE_ADJUSTMENT` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `ADJUSTAREAVALUES` | `BAPIFAPO_AREAVALUES` | ✓ |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |

## `BAPI_ASSET_WRITEUP_CHECK`

Assets: Check Write-Up

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `WRITEUPDATA` | `BAPIFAPO_WRITEUP` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |
| TABLES | `WRITEUPAREAVALUES` | `BAPIFAPO_AREAVALUES_WRITEUP` | ✓ |  |

## `BAPI_ASSET_WRITEUP_POST`

Assets: Post Write-Up

- Function group `AMFA` · package `ABAS` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTASSIGNMENTS` | `BAPIFAPO_ACC_ASS` | ✓ |  |
| IMPORTING | `FURTHERPOSTINGDATA` | `BAPIFAPO_ADD_INFO` | ✓ |  |
| IMPORTING | `GENERALPOSTINGDATA` | `BAPIFAPO_GEN_INFO` |  |  |
| IMPORTING | `ORIGINDOCREFERENCE` | `BAPIFAPO_DOC_REF` | ✓ |  |
| IMPORTING | `WRITEUPDATA` | `BAPIFAPO_WRITEUP` |  |  |
| EXPORTING | `DOCUMENTREFERENCE` | `BAPIFAPO_DOC_REF` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `RETURN_ALL` | `BAPIRET2` | ✓ |  |
| TABLES | `WRITEUPAREAVALUES` | `BAPIFAPO_AREAVALUES_WRITEUP` | ✓ |  |

## `BAPI_BUSINESSAREA_EXISTENCECHK`

Check if business area exists

- Function group `0003` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BUSINESSAREAID` | `BAPI0003_2-BUS_AREA` |  |  |
| IMPORTING | `CHECK_AUTHORITY` | `BAPI0003_4-CHECK_AUTHORITY` | ✓ | 'X' |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_BUSINESSAREA_GETDETAIL`

Business area details

- Function group `0003` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `BUSINESSAREAID` | `BAPI0003_2-BUS_AREA` |  |  |
| IMPORTING | `LANGUAGE` | `BAPI0003_3-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI0003_3-LANGU_ISO` | ✓ |  |
| EXPORTING | `BUSINESSAREA_DETAIL` | `BAPI0003_2` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_BUSINESSAREA_GETLIST`

List of business areas

- Function group `0003` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `LANGUAGE` | `BAPI0003_3-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI0003_3-LANGU_ISO` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `BUSINESSAREA_LIST` | `BAPI0003_1` |  |  |

## `BAPI_CASHJOURNALDOC_CREATE`

Save FI Cash Journal Documents

- Function group `SAPLFCJ_BAPI` · package `CAJO` · component `FI-BL-PT`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `HEADER` | `BAPI_CJ_HEADER` |  |  |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| EXPORTING | `CASH_JOURNAL_DOC_NO` | `BAPI_CJ_KEY-POSTING_NUMBER` |  |  |
| EXPORTING | `CASH_JOURNAL_NUMBER` | `BAPI_CJ_HEADER-CAJO_NUMBER` |  |  |
| EXPORTING | `COMPANY_CODE` | `BAPI_CJ_HEADER-COMP_CODE` |  |  |
| EXPORTING | `FISCAL_YEAR` | `BAPI_CJ_KEY-FISC_YEAR` |  |  |
| TABLES | `CPD_ITEMS` | `BAPI_CJ_CPD_ITEMS` | ✓ |  |
| TABLES | `EXTENSION_IN` | `BAPIPAREX` | ✓ |  |
| TABLES | `ITEMS` | `BAPI_CJ_ITEMS` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `TAX_ITEMS` | `BAPI_CJ_TAX_ITEMS` | ✓ |  |
| TABLES | `WTAX_ITEMS` | `BAPI_CJ_WTAX_ITEMS` | ✓ |  |

## `BAPI_CCODE_GET_FIRSTDAY_PERIOD`

For Company Code: First Day of Period

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODEID` | `BAPI0002_2-COMP_CODE` |  |  |
| IMPORTING | `FISCAL_PERIOD` | `BAPI0002_4-FISCAL_PERIOD` |  |  |
| IMPORTING | `FISCAL_YEAR` | `BAPI0002_4-FISCAL_YEAR` |  |  |
| EXPORTING | `FIRST_DAY_OF_PERIOD` | `BAPI0002_4-POSTING_DATE` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_CCODE_GET_LASTDAY_FYEAR`

For Company Code: Last Day of Fiscal Year

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODEID` | `BAPI0002_2-COMP_CODE` |  |  |
| IMPORTING | `FISCAL_YEAR` | `BAPI0002_4-FISCAL_YEAR` |  |  |
| EXPORTING | `LAST_DAY_OF_FISCAL_YEAR` | `BAPI0002_4-POSTING_DATE` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_COMPANYCODE_EXISTENCECHK`

Check if Company Code Exists

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODEID` | `BAPI0002_2-COMP_CODE` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_COMPANYCODE_GETDETAIL`

Company Code Details

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODEID` | `BAPI0002_2-COMP_CODE` |  |  |
| EXPORTING | `COMPANYCODE_ADDRESS` | `BAPI0002_3` |  |  |
| EXPORTING | `COMPANYCODE_DETAIL` | `BAPI0002_2` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_COMPANYCODE_GETLIST`

List of Company Codes

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `COMPANYCODE_LIST` | `BAPI0002_1` |  |  |

## `BAPI_COMPANYCODE_GET_PERIOD`

For Company Code: Posting Date -> Period, Fiscal Year

- Function group `0002` · package `FBASCORE` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODEID` | `BAPI0002_2-COMP_CODE` |  |  |
| IMPORTING | `POSTING_DATE` | `BAPI0002_4-POSTING_DATE` |  |  |
| EXPORTING | `FISCAL_PERIOD` | `BAPI0002_4-FISCAL_PERIOD` |  |  |
| EXPORTING | `FISCAL_YEAR` | `BAPI0002_4-FISCAL_YEAR` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_COMPANY_EXISTENCECHECK`

Check if company exists

- Function group `0014` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYID` | `BAPI0014_2-COMPANY` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_COMPANY_GETDETAIL`

Company details

- Function group `0014` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYID` | `BAPI0014_2-COMPANY` |  |  |
| EXPORTING | `COMPANY_DETAIL` | `BAPI0014_2` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_COMPANY_GETLIST`

List of companies

- Function group `0014` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `COMPANY_LIST` | `BAPI0014_1` |  |  |

## `BAPI_CREDIT_ACCOUNT_GET_STATUS`

Determine Credit Status of Credit Account

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI1010-CUSTMR_NO` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |
| TABLES | `CREDIT_ACCOUNT_DETAIL` | `BAPI1010_1` |  |  |
| TABLES | `CREDIT_ACCOUNT_OPEN_ITEMS` | `BAPI1010_2` |  |  |

## `BAPI_CREDIT_ACCOUNT_REP_STATUS`

Receive Credit Management Account Status and Send to Database

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |
| TABLES | `CREDIT_ACCOUNT_DETAIL` | `BAPI1010_1` |  |  |
| TABLES | `CREDIT_ACCOUNT_OPEN_ITEMS` | `BAPI1010_2` |  |  |

## `BAPI_CR_ACC_GETDETAIL`

BAPI/BUS1010: Determine Master Record Data

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOWED_AGING_IN_DAYS` | `BAPI1010_P-AL_AG_DAYS` | ✓ | '01' |
| IMPORTING | `ALLOWED_AGING_IN_HOURS` | `BAPI1010_P-AL_AG_HOUR` | ✓ | '00' |
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI1010-CUSTMR_NO` |  |  |
| EXPORTING | `CREDIT_ACCOUNT_DETAIL` | `BAPI1010_6` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_CR_ACC_GETHIGHESTDUNNINGL`

BAPI/BUS1010: Determine Highest Dunning Level

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOWED_AGING_IN_DAYS` | `BAPI1010_P-AL_AG_DAYS` | ✓ | '01' |
| IMPORTING | `ALLOWED_AGING_IN_HOURS` | `BAPI1010_P-AL_AG_HOUR` | ✓ | '00' |
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| IMPORTING | `CURRENT_PAYER_ONLY` | `BAPI1010_P-CR_PY_ONLY` | ✓ | 'X' |
| IMPORTING | `CUSTOMER` | `BAPI1010-CUSTMR_NO` |  |  |
| IMPORTING | `HIGHEST_DUNNING_LEVEL_ALLOWED` | `BAPI1010_P-H_DU_LEVEL` |  |  |
| EXPORTING | `HIGHEST_DUNNING_LEVEL_DATA` | `BAPI1010_4` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_CR_ACC_GETOLDESTOPENITEM`

BAPI/BUS1010: Determine Oldest Open Item

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOWED_AGING_IN_DAYS` | `BAPI1010_P-AL_AG_DAYS` | ✓ | '01' |
| IMPORTING | `ALLOWED_AGING_IN_HOURS` | `BAPI1010_P-AL_AG_HOUR` | ✓ | '00' |
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| IMPORTING | `CURRENT_PAYER_ONLY` | `BAPI1010_P-CR_PY_ONLY` | ✓ | 'X' |
| IMPORTING | `CUSTOMER` | `BAPI1010-CUSTMR_NO` |  |  |
| EXPORTING | `OLDEST_OPEN_ITEM_DATA` | `BAPI1010_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_CR_ACC_GETOPENITEMSSTRUCT`

BAPI/BUS1010: Determine OI Structure

- Function group `1010` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOWED_AGING_IN_DAYS` | `BAPI1010_P-AL_AG_DAYS` | ✓ | '01' |
| IMPORTING | `ALLOWED_AGING_IN_HOURS` | `BAPI1010_P-AL_AG_HOUR` | ✓ | '00' |
| IMPORTING | `ALLOWED_DAYS_IN_ARREARS` | `BAPI1010_P-AL_DY_TOL` |  |  |
| IMPORTING | `CREDITCONTROLAREA` | `BAPI1010-C_CTR_AREA` |  |  |
| IMPORTING | `CURRENT_PAYER_ONLY` | `BAPI1010_P-CR_PY_ONLY` |  |  |
| IMPORTING | `CUSTOMER` | `BAPI1010-CUSTMR_NO` |  |  |
| EXPORTING | `OPEN_ITEMS_STRUCTURE_DATA` | `BAPI1010_5` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |

## `BAPI_DEBTOR_CHANGEPASSWORD`

Change Customer Password

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| IMPORTING | `NEW_PASSWORD` | `BAPIUID-PASSWORD` |  |  |
| IMPORTING | `PASSWORD` | `BAPIUID-PASSWORD` |  |  |
| IMPORTING | `VERIFY_PASSWORD` | `BAPIUID-PASSWORD` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_DEBTOR_CHECKPASSWORD`

Check Customer Password

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| IMPORTING | `PASSWORD` | `BAPIUID-PASSWORD` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_DEBTOR_CREATE_PW_REG`

Create Entry for Customer Password

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_DEBTOR_DELETE_PW_REG`

Delete Customer Password Entry

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_DEBTOR_EXISTENCECHECK`

Check Customer Existence

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1007-COMP_CODE` | ✓ |  |
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_DEBTOR_FIND`

Customer Matchcode

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `MAX_CNT` | `BAPI1007_9-MAX_CNT` | ✓ | 0 |
| IMPORTING | `PL_HOLD` | `BAPI1007_9-PL_HOLD` | ✓ | SPACE |
| EXPORTING | `RETURN` | `BAPIRETURN1` |  |  |
| TABLES | `RESULT_TAB` | `BAPI1007_8` |  |  |
| TABLES | `SELOPT_TAB` | `BAPI1007_7` |  |  |

## `BAPI_DEBTOR_GETDETAIL`

Customer Detail Information

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1007-COMP_CODE` | ✓ |  |
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `DEBITOR_COMPANY_DETAIL` | `BAPI1007_5` |  |  |
| EXPORTING | `DEBITOR_GENERAL_DETAIL` | `BAPI1007_4` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `DEBITOR_BANK_DETAIL` | `BAPI1007_6` | ✓ |  |

## `BAPI_DEBTOR_GET_PW_REG`

Read entry for customer password

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `STATUSINFO` | `BAPIUSWSTA` |  |  |

## `BAPI_DEBTOR_INITPASSWORD`

Initialize Customer Password

- Function group `1007` · package `FBD` · component `FI-AR-AR`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DEBTORID` | `BAPI1007-CUSTOMER` |  |  |
| EXPORTING | `PASSWORD` | `BAPIUID-PASSWORD` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_FAGL_PLANNING_POST`

BAPI for Transferring Plan Data to New General Ledger Accounting

- Function group `FAGL_PLANNING_RFC` · package `FAGL_PLANNING` · component `FI-GL-GL`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DELTA` | `BAPIBUS1600_S_PARAM-DELTA` | ✓ | SPACE |
| IMPORTING | `HEADERINFO` | `BAPIBUS1600_PLAN_HEAD` |  |  |
| IMPORTING | `TESTRUN` | `BAPIBUS1600_S_PARAM-TESTRUN` | ✓ | SPACE |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |
| TABLES | `FIELDLIST` | `BAPIBUS1600_S_FIELDLIST` | ✓ |  |
| TABLES | `PERVALUE` | `BAPIBUS1600_S_POS_PERIOD` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_FAGL_PLANNING_READ`

Read In Data

- Function group `FAGL_PLANNING_RFC` · package `FAGL_PLANNING` · component `FI-GL-GL`
- Remote-enabled: no — local only
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `HEADERINFO` | `BAPIBUS1600_PLAN_HEAD` |  |  |
| IMPORTING | `I_FIELDLIST` | `GUSL_T_FIELDS` |  |  |
| IMPORTING | `I_SELECTION` | `GUSL_T_SELECTION` |  |  |
| IMPORTING | `TABLENAME` | `TABNAME` |  | 'V_GLFLEXT' |
| EXPORTING | `HSL_CURR` | `T001-WAERS` |  |  |
| CHANGING | `IT_TOTTABLE` | `TABLE` |  |  |
| TABLES | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_FIXEDASSET_CHANGE`

Changes an Asset

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOCATIONS` | `BAPI1022_FEGLG004` | ✓ |  |
| IMPORTING | `ALLOCATIONSX` | `BAPI1022_FEGLG004X` | ✓ |  |
| IMPORTING | `ASSET` | `BAPI1022_1-ASSETMAINO` |  |  |
| IMPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| IMPORTING | `GENERALDATA` | `BAPI1022_FEGLG001` | ✓ |  |
| IMPORTING | `GENERALDATAX` | `BAPI1022_FEGLG001X` | ✓ |  |
| IMPORTING | `GLO_IN_GEN` | `BAPI1022_GLO_IN_GEN` | ✓ |  |
| IMPORTING | `GLO_IN_GENX` | `BAPI1022_GLO_IN_GENX` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16` | `BAPI1022_GLO_JP_ANN16` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16X` | `BAPI1022_GLO_JP_ANN16X` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTD` | `BAPI1022_GLO_JP_IMPTD` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTDX` | `BAPI1022_GLO_JP_IMPTDX` | ✓ |  |
| IMPORTING | `GLO_JP_PTX` | `BAPI1022_GLO_JP_PTX` | ✓ |  |
| IMPORTING | `GLO_JP_PTXX` | `BAPI1022_GLO_JP_PTXX` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACE` | `BAPI1022_GLO_KR_BUS_PLACE` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACEX` | `BAPI1022_GLO_KR_BUS_PLACEX` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODE` | `BAPI1022_GLO_NATL_CLFN` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODEX` | `BAPI1022_GLO_NATL_CLFNX` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPS` | `BAPI1022_GLO_PT_FSCL_MAPS` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPSX` | `BAPI1022_GLO_PT_FSCL_MAPSX` | ✓ |  |
| IMPORTING | `GLO_RUS_GEN` | `BAPI1022_GLO_RUS_GEN` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTD` | `BAPI1022_GLO_RUS_GENTD` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTDX` | `BAPI1022_GLO_RUS_GENTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_GENX` | `BAPI1022_GLO_RUS_GENX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTX` | `BAPI1022_GLO_RUS_LTX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTD` | `BAPI1022_GLO_RUS_LTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTDX` | `BAPI1022_GLO_RUS_LTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXX` | `BAPI1022_GLO_RUS_LTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTX` | `BAPI1022_GLO_RUS_PTX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTD` | `BAPI1022_GLO_RUS_PTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTDX` | `BAPI1022_GLO_RUS_PTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXX` | `BAPI1022_GLO_RUS_PTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_TRC` | `BAPI1022_GLO_RUS_TRC` | ✓ |  |
| IMPORTING | `GLO_RUS_TRCX` | `BAPI1022_GLO_RUS_TRCX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTX` | `BAPI1022_GLO_RUS_TTX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTD` | `BAPI1022_GLO_RUS_TTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTDX` | `BAPI1022_GLO_RUS_TTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXX` | `BAPI1022_GLO_RUS_TTXX` | ✓ |  |
| IMPORTING | `GLO_TIME_DEP` | `BAPI1022_GLO_TIME_DEP` | ✓ |  |
| IMPORTING | `GROUPASSET` | `BAPI1022_MISC-XANLGR` | ✓ |  |
| IMPORTING | `INSURANCE` | `BAPI1022_FEGLG008` | ✓ |  |
| IMPORTING | `INSURANCEX` | `BAPI1022_FEGLG008X` | ✓ |  |
| IMPORTING | `INVENTORY` | `BAPI1022_FEGLG011` | ✓ |  |
| IMPORTING | `INVENTORYX` | `BAPI1022_FEGLG011X` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNT` | `BAPI1022_FEGLG010` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNTX` | `BAPI1022_FEGLG010X` | ✓ |  |
| IMPORTING | `LEASING` | `BAPI1022_FEGLG005` | ✓ |  |
| IMPORTING | `LEASINGX` | `BAPI1022_FEGLG005X` | ✓ |  |
| IMPORTING | `NETWORTHVALUATION` | `BAPI1022_FEGLG006` | ✓ |  |
| IMPORTING | `NETWORTHVALUATIONX` | `BAPI1022_FEGLG006X` | ✓ |  |
| IMPORTING | `ORIGIN` | `BAPI1022_FEGLG009` | ✓ |  |
| IMPORTING | `ORIGINX` | `BAPI1022_FEGLG009X` | ✓ |  |
| IMPORTING | `POSTINGINFORMATION` | `BAPI1022_FEGLG002` | ✓ |  |
| IMPORTING | `POSTINGINFORMATIONX` | `BAPI1022_FEGLG002X` | ✓ |  |
| IMPORTING | `REALESTATE` | `BAPI1022_FEGLG007` | ✓ |  |
| IMPORTING | `REALESTATEX` | `BAPI1022_FEGLG007X` | ✓ |  |
| IMPORTING | `SUBNUMBER` | `BAPI1022_1-ASSETSUBNO` |  |  |
| IMPORTING | `TIMEDEPENDENTDATA` | `BAPI1022_FEGLG003` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATAX` | `BAPI1022_FEGLG003X` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `DEPRECIATIONAREAS` | `BAPI1022_DEP_AREAS` | ✓ |  |
| TABLES | `DEPRECIATIONAREASX` | `BAPI1022_DEP_AREASX` | ✓ |  |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |
| TABLES | `INVESTMENT_SUPPORT` | `BAPI1022_INV_SUPPORT` | ✓ |  |

## `BAPI_FIXEDASSET_CREATE`

Creates an Asset

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOCATIONS` | `BAPI1022_FEGLG004` | ✓ |  |
| IMPORTING | `ALLOCATIONSX` | `BAPI1022_FEGLG004X` | ✓ |  |
| IMPORTING | `ASSET` | `BAPI1022_1-ASSETMAINO` | ✓ |  |
| IMPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| IMPORTING | `CREATESUBNUMBER` | `BAPI1022_MISC-XSUBNO` | ✓ |  |
| IMPORTING | `GENERALDATA` | `BAPI1022_FEGLG001` | ✓ |  |
| IMPORTING | `GENERALDATAX` | `BAPI1022_FEGLG001X` | ✓ |  |
| IMPORTING | `INSURANCE` | `BAPI1022_FEGLG008` | ✓ |  |
| IMPORTING | `INSURANCEX` | `BAPI1022_FEGLG008X` | ✓ |  |
| IMPORTING | `INVENTORY` | `BAPI1022_FEGLG011` | ✓ |  |
| IMPORTING | `INVENTORYX` | `BAPI1022_FEGLG011X` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNT` | `BAPI1022_FEGLG010` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNTX` | `BAPI1022_FEGLG010X` | ✓ |  |
| IMPORTING | `LEASING` | `BAPI1022_FEGLG005` | ✓ |  |
| IMPORTING | `LEASINGX` | `BAPI1022_FEGLG005X` | ✓ |  |
| IMPORTING | `NETWORTHVALUATION` | `BAPI1022_FEGLG006` | ✓ |  |
| IMPORTING | `NETWORTHVALUATIONX` | `BAPI1022_FEGLG006X` | ✓ |  |
| IMPORTING | `ORIGIN` | `BAPI1022_FEGLG009` | ✓ |  |
| IMPORTING | `ORIGINX` | `BAPI1022_FEGLG009X` | ✓ |  |
| IMPORTING | `POSTINGINFORMATION` | `BAPI1022_FEGLG002` | ✓ |  |
| IMPORTING | `POSTINGINFORMATIONX` | `BAPI1022_FEGLG002X` | ✓ |  |
| IMPORTING | `REALESTATE` | `BAPI1022_FEGLG007` | ✓ |  |
| IMPORTING | `REALESTATEX` | `BAPI1022_FEGLG007X` | ✓ |  |
| IMPORTING | `REFERENCE` | `BAPI1022_REFERENCE` | ✓ |  |
| IMPORTING | `SUBNUMBER` | `BAPI1022_1-ASSETSUBNO` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATA` | `BAPI1022_FEGLG003` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATAX` | `BAPI1022_FEGLG003X` | ✓ |  |
| EXPORTING | `ASSETCREATED` | `BAPI1022_REFERENCE` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `DEPRECIATIONAREAS` | `BAPI1022_DEP_AREAS` | ✓ |  |
| TABLES | `DEPRECIATIONAREASX` | `BAPI1022_DEP_AREASX` | ✓ |  |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |

## `BAPI_FIXEDASSET_CREATE1`

Creates an Asset

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOCATIONS` | `BAPI1022_FEGLG004` | ✓ |  |
| IMPORTING | `ALLOCATIONSX` | `BAPI1022_FEGLG004X` | ✓ |  |
| IMPORTING | `CREATEGROUPASSET` | `BAPI1022_MISC-XANLGR` | ✓ |  |
| IMPORTING | `CREATESUBNUMBER` | `BAPI1022_MISC-XSUBNO` | ✓ |  |
| IMPORTING | `GENERALDATA` | `BAPI1022_FEGLG001` | ✓ |  |
| IMPORTING | `GENERALDATAX` | `BAPI1022_FEGLG001X` | ✓ |  |
| IMPORTING | `GLO_IN_GEN` | `BAPI1022_GLO_IN_GEN` | ✓ |  |
| IMPORTING | `GLO_IN_GENX` | `BAPI1022_GLO_IN_GENX` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16` | `BAPI1022_GLO_JP_ANN16` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16X` | `BAPI1022_GLO_JP_ANN16X` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTD` | `BAPI1022_GLO_JP_IMPTD` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTDX` | `BAPI1022_GLO_JP_IMPTDX` | ✓ |  |
| IMPORTING | `GLO_JP_PTX` | `BAPI1022_GLO_JP_PTX` | ✓ |  |
| IMPORTING | `GLO_JP_PTXX` | `BAPI1022_GLO_JP_PTXX` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACE` | `BAPI1022_GLO_KR_BUS_PLACE` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACEX` | `BAPI1022_GLO_KR_BUS_PLACEX` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODE` | `BAPI1022_GLO_NATL_CLFN` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODEX` | `BAPI1022_GLO_NATL_CLFNX` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPS` | `BAPI1022_GLO_PT_FSCL_MAPS` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPSX` | `BAPI1022_GLO_PT_FSCL_MAPSX` | ✓ |  |
| IMPORTING | `GLO_RUS_GEN` | `BAPI1022_GLO_RUS_GEN` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTD` | `BAPI1022_GLO_RUS_GENTD` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTDX` | `BAPI1022_GLO_RUS_GENTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_GENX` | `BAPI1022_GLO_RUS_GENX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTX` | `BAPI1022_GLO_RUS_LTX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTD` | `BAPI1022_GLO_RUS_LTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTDX` | `BAPI1022_GLO_RUS_LTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXX` | `BAPI1022_GLO_RUS_LTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTX` | `BAPI1022_GLO_RUS_PTX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTD` | `BAPI1022_GLO_RUS_PTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTDX` | `BAPI1022_GLO_RUS_PTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXX` | `BAPI1022_GLO_RUS_PTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_TRC` | `BAPI1022_GLO_RUS_TRC` | ✓ |  |
| IMPORTING | `GLO_RUS_TRCX` | `BAPI1022_GLO_RUS_TRCX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTX` | `BAPI1022_GLO_RUS_TTX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTD` | `BAPI1022_GLO_RUS_TTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTDX` | `BAPI1022_GLO_RUS_TTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXX` | `BAPI1022_GLO_RUS_TTXX` | ✓ |  |
| IMPORTING | `GLO_TIME_DEP` | `BAPI1022_GLO_TIME_DEP` | ✓ |  |
| IMPORTING | `INSURANCE` | `BAPI1022_FEGLG008` | ✓ |  |
| IMPORTING | `INSURANCEX` | `BAPI1022_FEGLG008X` | ✓ |  |
| IMPORTING | `INVENTORY` | `BAPI1022_FEGLG011` | ✓ |  |
| IMPORTING | `INVENTORYX` | `BAPI1022_FEGLG011X` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNT` | `BAPI1022_FEGLG010` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNTX` | `BAPI1022_FEGLG010X` | ✓ |  |
| IMPORTING | `KEY` | `BAPI1022_KEY` |  |  |
| IMPORTING | `LEASING` | `BAPI1022_FEGLG005` | ✓ |  |
| IMPORTING | `LEASINGX` | `BAPI1022_FEGLG005X` | ✓ |  |
| IMPORTING | `NETWORTHVALUATION` | `BAPI1022_FEGLG006` | ✓ |  |
| IMPORTING | `NETWORTHVALUATIONX` | `BAPI1022_FEGLG006X` | ✓ |  |
| IMPORTING | `ORIGIN` | `BAPI1022_FEGLG009` | ✓ |  |
| IMPORTING | `ORIGINX` | `BAPI1022_FEGLG009X` | ✓ |  |
| IMPORTING | `POSTCAP` | `BAPI1022_MISC-POSTCAP` | ✓ |  |
| IMPORTING | `POSTINGINFORMATION` | `BAPI1022_FEGLG002` | ✓ |  |
| IMPORTING | `POSTINGINFORMATIONX` | `BAPI1022_FEGLG002X` | ✓ |  |
| IMPORTING | `REALESTATE` | `BAPI1022_FEGLG007` | ✓ |  |
| IMPORTING | `REALESTATEX` | `BAPI1022_FEGLG007X` | ✓ |  |
| IMPORTING | `REFERENCE` | `BAPI1022_REFERENCE` | ✓ |  |
| IMPORTING | `TESTRUN` | `BAPI1022_MISC-TESTRUN` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATA` | `BAPI1022_FEGLG003` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATAX` | `BAPI1022_FEGLG003X` | ✓ |  |
| EXPORTING | `ASSET` | `BAPI1022_1-ASSETMAINO` |  |  |
| EXPORTING | `ASSETCREATED` | `BAPI1022_REFERENCE` |  |  |
| EXPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| EXPORTING | `SUBNUMBER` | `BAPI1022_1-ASSETSUBNO` |  |  |
| TABLES | `DEPRECIATIONAREAS` | `BAPI1022_DEP_AREAS` | ✓ |  |
| TABLES | `DEPRECIATIONAREASX` | `BAPI1022_DEP_AREASX` | ✓ |  |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |
| TABLES | `INVESTMENT_SUPPORT` | `BAPI1022_INV_SUPPORT` | ✓ |  |

## `BAPI_FIXEDASSET_GETDETAIL`

Display Detailed Information on a Fixed Asset

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ASSET` | `BAPI1022_1-ASSETMAINO` |  |  |
| IMPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| IMPORTING | `EVALUATION_DATE` | `BAPI1022_5-EVAL_DATE` | ✓ | '00000000' |
| IMPORTING | `SUBNUMBER` | `BAPI1022_1-ASSETSUBNO` |  |  |
| EXPORTING | `BASIC_DATA` | `BAPI1022_2` |  |  |
| EXPORTING | `ORGANIZATIONAL_DATA` | `BAPI1022_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| EXPORTING | `SPECIAL_CLASSIFICATIONS` | `BAPI1022_4` |  |  |

## `BAPI_FIXEDASSET_GETLIST`

Information on Selected Assets

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| IMPORTING | `DEPRECIATIONAREA` | `BAPI1022_DEP_AREAS-AREA` | ✓ |  |
| IMPORTING | `EVALUATIONDATE` | `BAPI1022_5-EVAL_DATE` | ✓ |  |
| IMPORTING | `MAXENTRIES` | `BAPI1022_MISC-MAXENTRIES` | ✓ |  |
| IMPORTING | `REQUESTEDTABLESX` | `BAPI1022_REQUESTEDTABLESX` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `ALLOCATIONS` | `BAPI1022_FEGLG004_PID` | ✓ |  |
| TABLES | `DEPRECIATIONAREAS` | `BAPI1022_DEP_AREAS_PID` | ✓ |  |
| TABLES | `DEPRECIATIONAREAVALS` | `BAPI1022_VALUES` | ✓ |  |
| TABLES | `EXTENSIONOUT` | `BAPIPAREX` | ✓ |  |
| TABLES | `GENERALDATA` | `BAPI1022_FEGLG001_PID` | ✓ |  |
| TABLES | `INSURANCE` | `BAPI1022_FEGLG008_PID` | ✓ |  |
| TABLES | `INVENTORY` | `BAPI1022_FEGLG011_PID` | ✓ |  |
| TABLES | `INVESTACCTASSIGNMNT` | `BAPI1022_FEGLG010_PID` | ✓ |  |
| TABLES | `INVESTMENT_SUPPORT` | `BAPI1022_INV_SUPPORT_PID` | ✓ |  |
| TABLES | `LEASING` | `BAPI1022_FEGLG005_PID` | ✓ |  |
| TABLES | `NETWORTHVALUATION` | `BAPI1022_FEGLG006_PID` | ✓ |  |
| TABLES | `ORIGIN` | `BAPI1022_FEGLG009_PID` | ✓ |  |
| TABLES | `POSTINGINFORMATION` | `BAPI1022_FEGLG002_PID` | ✓ |  |
| TABLES | `REALESTATE` | `BAPI1022_FEGLG007_PID` | ✓ |  |
| TABLES | `SELECTIONCRITERIA` | `BAPI1022_SELECTIONCRITERIA` | ✓ |  |
| TABLES | `TIMEDEPENDENTDATA` | `BAPI1022_FEGLG003_PID` | ✓ |  |

## `BAPI_FIXEDASSET_OVRTAKE_CREATE`

BAPI for Legacy Data Transfer

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ALLOCATIONS` | `BAPI1022_FEGLG004` | ✓ |  |
| IMPORTING | `ALLOCATIONSX` | `BAPI1022_FEGLG004X` | ✓ |  |
| IMPORTING | `CREATEGROUPASSET` | `BAPI1022_MISC-XANLGR` | ✓ |  |
| IMPORTING | `CREATESUBNUMBER` | `BAPI1022_MISC-XSUBNO` | ✓ |  |
| IMPORTING | `GENERALDATA` | `BAPI1022_FEGLG001` | ✓ |  |
| IMPORTING | `GENERALDATAX` | `BAPI1022_FEGLG001X` | ✓ |  |
| IMPORTING | `GLO_IN_GEN` | `BAPI1022_GLO_IN_GEN` | ✓ |  |
| IMPORTING | `GLO_IN_GENX` | `BAPI1022_GLO_IN_GENX` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16` | `BAPI1022_GLO_JP_ANN16` | ✓ |  |
| IMPORTING | `GLO_JP_ANN16X` | `BAPI1022_GLO_JP_ANN16X` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTD` | `BAPI1022_GLO_JP_IMPTD` | ✓ |  |
| IMPORTING | `GLO_JP_IMPTDX` | `BAPI1022_GLO_JP_IMPTDX` | ✓ |  |
| IMPORTING | `GLO_JP_PTX` | `BAPI1022_GLO_JP_PTX` | ✓ |  |
| IMPORTING | `GLO_JP_PTXX` | `BAPI1022_GLO_JP_PTXX` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACE` | `BAPI1022_GLO_KR_BUS_PLACE` | ✓ |  |
| IMPORTING | `GLO_KR_BUS_PLACEX` | `BAPI1022_GLO_KR_BUS_PLACEX` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODE` | `BAPI1022_GLO_NATL_CLFN` | ✓ |  |
| IMPORTING | `GLO_NATL_CLFN_CODEX` | `BAPI1022_GLO_NATL_CLFNX` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPS` | `BAPI1022_GLO_PT_FSCL_MAPS` | ✓ |  |
| IMPORTING | `GLO_PT_FSCL_MAPSX` | `BAPI1022_GLO_PT_FSCL_MAPSX` | ✓ |  |
| IMPORTING | `GLO_RUS_GEN` | `BAPI1022_GLO_RUS_GEN` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTD` | `BAPI1022_GLO_RUS_GENTD` | ✓ |  |
| IMPORTING | `GLO_RUS_GENTDX` | `BAPI1022_GLO_RUS_GENTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_GENX` | `BAPI1022_GLO_RUS_GENX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTX` | `BAPI1022_GLO_RUS_LTX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTD` | `BAPI1022_GLO_RUS_LTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXTDX` | `BAPI1022_GLO_RUS_LTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_LTXX` | `BAPI1022_GLO_RUS_LTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTX` | `BAPI1022_GLO_RUS_PTX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTD` | `BAPI1022_GLO_RUS_PTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXTDX` | `BAPI1022_GLO_RUS_PTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_PTXX` | `BAPI1022_GLO_RUS_PTXX` | ✓ |  |
| IMPORTING | `GLO_RUS_TRC` | `BAPI1022_GLO_RUS_TRC` | ✓ |  |
| IMPORTING | `GLO_RUS_TRCX` | `BAPI1022_GLO_RUS_TRCX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTX` | `BAPI1022_GLO_RUS_TTX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTD` | `BAPI1022_GLO_RUS_TTXTD` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXTDX` | `BAPI1022_GLO_RUS_TTXTDX` | ✓ |  |
| IMPORTING | `GLO_RUS_TTXX` | `BAPI1022_GLO_RUS_TTXX` | ✓ |  |
| IMPORTING | `GLO_TIME_DEP` | `BAPI1022_GLO_TIME_DEP` | ✓ |  |
| IMPORTING | `INSURANCE` | `BAPI1022_FEGLG008` | ✓ |  |
| IMPORTING | `INSURANCEX` | `BAPI1022_FEGLG008X` | ✓ |  |
| IMPORTING | `INVENTORY` | `BAPI1022_FEGLG011` | ✓ |  |
| IMPORTING | `INVENTORYX` | `BAPI1022_FEGLG011X` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNT` | `BAPI1022_FEGLG010` | ✓ |  |
| IMPORTING | `INVESTACCTASSIGNMNTX` | `BAPI1022_FEGLG010X` | ✓ |  |
| IMPORTING | `KEY` | `BAPI1022_KEY` |  |  |
| IMPORTING | `LEASING` | `BAPI1022_FEGLG005` | ✓ |  |
| IMPORTING | `LEASINGX` | `BAPI1022_FEGLG005X` | ✓ |  |
| IMPORTING | `NETWORTHVALUATION` | `BAPI1022_FEGLG006` | ✓ |  |
| IMPORTING | `NETWORTHVALUATIONX` | `BAPI1022_FEGLG006X` | ✓ |  |
| IMPORTING | `ORIGIN` | `BAPI1022_FEGLG009` | ✓ |  |
| IMPORTING | `ORIGINX` | `BAPI1022_FEGLG009X` | ✓ |  |
| IMPORTING | `POSTINGINFORMATION` | `BAPI1022_FEGLG002` | ✓ |  |
| IMPORTING | `POSTINGINFORMATIONX` | `BAPI1022_FEGLG002X` | ✓ |  |
| IMPORTING | `REALESTATE` | `BAPI1022_FEGLG007` | ✓ |  |
| IMPORTING | `REALESTATEX` | `BAPI1022_FEGLG007X` | ✓ |  |
| IMPORTING | `REFERENCE` | `BAPI1022_REFERENCE` | ✓ |  |
| IMPORTING | `TESTRUN` | `BAPI1022_MISC-TESTRUN` | ✓ | SPACE |
| IMPORTING | `TIMEDEPENDENTDATA` | `BAPI1022_FEGLG003` | ✓ |  |
| IMPORTING | `TIMEDEPENDENTDATAX` | `BAPI1022_FEGLG003X` | ✓ |  |
| EXPORTING | `ASSET` | `BAPI1022_1-ASSETMAINO` |  |  |
| EXPORTING | `ASSETCREATED` | `BAPI1022_REFERENCE` |  |  |
| EXPORTING | `COMPANYCODE` | `BAPI1022_1-COMP_CODE` |  |  |
| EXPORTING | `SUBNUMBER` | `BAPI1022_1-ASSETSUBNO` |  |  |
| TABLES | `CUMULATEDVALUES` | `BAPI1022_CUMVAL` | ✓ |  |
| TABLES | `DEPRECIATIONAREAS` | `BAPI1022_DEP_AREAS` | ✓ |  |
| TABLES | `DEPRECIATIONAREASX` | `BAPI1022_DEP_AREASX` | ✓ |  |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |
| TABLES | `INVESTMENT_SUPPORT` | `BAPI1022_INV_SUPPORT` | ✓ |  |
| TABLES | `POSTEDVALUES` | `BAPI1022_POSTVAL` | ✓ |  |
| TABLES | `POSTINGHEADERS` | `BAPI1022_POSTINGHEADER` | ✓ |  |
| TABLES | `PROPORTIONALVALUES` | `BAPI1022_PROPVAL` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |
| TABLES | `TRANSACTIONS` | `BAPI1022_TRTYPE` | ✓ |  |

## `BAPI_FIXEDASSET_OVRTAKE_POST`

BAPI for Legacy Data Transfer: Post Transfer Values to Existing Asset

- Function group `1022` · package `AA` · component `FI-AA-AA`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `KEY` | `BAPI1022_KEY` |  |  |
| IMPORTING | `TESTRUN` | `BAPI1022_MISC-TESTRUN` | ✓ | SPACE |
| TABLES | `CUMULATEDVALUES` | `BAPI1022_CUMVAL` | ✓ |  |
| TABLES | `POSTEDVALUES` | `BAPI1022_POSTVAL` | ✓ |  |
| TABLES | `POSTINGHEADERS` | `BAPI1022_POSTINGHEADER` | ✓ |  |
| TABLES | `PROPORTIONALVALUES` | `BAPI1022_PROPVAL` | ✓ |  |
| TABLES | `RETURN` | `BAPIRET2` | ✓ |  |
| TABLES | `TRANSACTIONS` | `BAPI1022_TRTYPE` | ✓ |  |

## `BAPI_FUNC_AREA_EXISTENCECHECK`

Check if functional area exists

- Function group `0023` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `FUNCTIONALAREAID` | `BAPI0023_1-FUNC_AREA_LONG` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_FUNC_AREA_GETDETAIL`

Functional area details

- Function group `0023` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `FUNCTIONALAREAID` | `BAPI0023_1-FUNC_AREA_LONG` |  |  |
| IMPORTING | `LANGUAGE` | `BAPI0023_2-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI0023_2-LANGU_ISO` | ✓ |  |
| EXPORTING | `FUNCTIONALAREA_DETAIL` | `BAPI0023_1` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_FUNC_AREA_GETLIST`

List of functional areas

- Function group `0023` · package `FBAS` · component `FI`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `LANGUAGE` | `BAPI0023_2-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI0023_2-LANGU_ISO` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `FUNCTIONALAREA_LIST` | `BAPI0023_1` |  |  |

## `BAPI_GLX_GETDOCITEMS`

Line Item of Document for Ledger with Totals Table FAGLFLEXT

- Function group `1028` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1028_11-COMP_CODE` |  |  |
| IMPORTING | `DOCNUMBERFROM` | `BAPI1028_11-DOC_FROMNO` |  |  |
| IMPORTING | `DOCNUMBERTO` | `BAPI1028_11-DOC_TONO` | ✓ |  |
| IMPORTING | `DOCUMENTTYPE` | `BAPI1028_11-TYPE` | ✓ |  |
| IMPORTING | `FISCALYEAR` | `BAPI1028_11-FISC_YEAR` |  |  |
| IMPORTING | `LEDGER` | `BAPI1028_11-LEDGER` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `EXTENSION1` | `BAPI1028EXT_1` | ✓ |  |
| TABLES | `ITEMSLIST` | `BAPI1028_12` |  |  |

## `BAPI_GL_ACC_EXISTENCECHECK`

Check existence of G/L account

- Function group `3006` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `GLACCT` | `BAPI3006_0-GL_ACCOUNT` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_ACC_GETBALANCE`

Closing balance of G/L account for chosen year

- Function group `3006` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI3006_5-CURR_TYPE` |  |  |
| IMPORTING | `FISCALYEAR` | `BAPI3006_3-FISC_YEAR` |  |  |
| IMPORTING | `GLACCT` | `BAPI3006_0-GL_ACCOUNT` |  |  |
| EXPORTING | `ACCOUNT_BALANCE` | `BAPI3006_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_ACC_GETCURRENTBALANCE`

Closing balance of G/L account for current year

- Function group `3006` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI3006_5-CURR_TYPE` |  |  |
| IMPORTING | `GLACCT` | `BAPI3006_0-GL_ACCOUNT` |  |  |
| EXPORTING | `ACCOUNT_BALANCE` | `BAPI3006_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_ACC_GETDETAIL`

G/L account details

- Function group `3006_HRO` · package `FBSCORE` · component `FI-GL-GL`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `GLACCT` | `BAPI3006_0-GL_ACCOUNT` |  |  |
| IMPORTING | `LANGUAGE` | `BAPI3006_5-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI3006_5-LANGU_ISO` | ✓ |  |
| IMPORTING | `TEXT_ONLY` | `BAPI3006_5-TEXT_ONLY` | ✓ |  |
| EXPORTING | `ACCOUNT_DETAIL` | `BAPI3006_2` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_ACC_GETLIST`

List of G/L accounts for each company code

- Function group `3006` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `LANGUAGE` | `BAPI3006_5-LANGU` | ✓ |  |
| IMPORTING | `LANGUAGE_ISO` | `BAPI3006_5-LANGU_ISO` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `ACCOUNT_LIST` | `BAPI3006_1` |  |  |

## `BAPI_GL_ACC_GETPERIODBALANCES`

Posting period balances for each G/L account

- Function group `3006` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI3006_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI3006_5-CURR_TYPE` |  |  |
| IMPORTING | `FISCALYEAR` | `BAPI3006_4-FISC_YEAR` |  |  |
| IMPORTING | `GLACCT` | `BAPI3006_0-GL_ACCOUNT` |  |  |
| EXPORTING | `BALANCE_CARRIED_FORWARD` | `BAPI3006_4-BALANCE` |  |  |
| EXPORTING | `BALANCE_CARRIED_FORWARD_LONG` | `BAPISALDO_31` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `ACCOUNT_BALANCES` | `BAPI3006_4` |  |  |

## `BAPI_GL_GETGLACCBALANCE`

Closing balance of G/L account for chosen year

- Function group `1028` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1028_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI1028_5-CURR_TYPE` |  |  |
| IMPORTING | `FISCALYEAR` | `BAPI1028_3-FISC_YEAR` |  |  |
| IMPORTING | `GLACCT` | `BAPI1028_0-GL_ACCOUNT` |  |  |
| EXPORTING | `ACCOUNT_BALANCE` | `BAPI1028_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_GETGLACCCURRENTBALANCE`

Closing balance of G/L account for current year

- Function group `1028` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1028_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI1028_5-CURR_TYPE` |  |  |
| IMPORTING | `GLACCT` | `BAPI1028_0-GL_ACCOUNT` |  |  |
| EXPORTING | `ACCOUNT_BALANCE` | `BAPI1028_3` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |

## `BAPI_GL_GETGLACCPERIODBALANCES`

Posting period balances for each G/L account

- Function group `1028` · package `FBS` · component `FI-GL-GL-N`
- Remote-enabled: yes (`FMODE = R`)
- Release: **not in `RODIR`** — SAP-internal, no released-API guarantee

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `COMPANYCODE` | `BAPI1028_0-COMP_CODE` |  |  |
| IMPORTING | `CURRENCYTYPE` | `BAPI1028_5-CURR_TYPE` |  |  |
| IMPORTING | `FISCALYEAR` | `BAPI1028_4-FISC_YEAR` |  |  |
| IMPORTING | `GLACCT` | `BAPI1028_0-GL_ACCOUNT` |  |  |
| EXPORTING | `BALANCE_CARRIED_FORWARD` | `BAPI1028_4-BALANCE` |  |  |
| EXPORTING | `BALANCE_CARRIED_FORWARD_LONG` | `BAPISALDO_31` |  |  |
| EXPORTING | `RETURN` | `BAPIRETURN` |  |  |
| TABLES | `ACCOUNT_BALANCES` | `BAPI1028_4` |  |  |

## `BAPI_PAYMENTREQUEST_CANCEL`

Cancel Payment Request

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `DATE_REV` | `BAPI2021_REV-DATE_REV` |  |  |
| IMPORTING | `REASON_REV` | `BAPI2021_REV-REASON_REV` |  |  |
| IMPORTING | `REQUESTID` | `BAPI2021_KEYNO-REQUESTID` |  |  |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_PAYMENTREQUEST_CREATE`

Creation of a Payment Request

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `ACCOUNTS` | `BAPI2021_ACCOUNTS` |  |  |
| IMPORTING | `AMOUNTS` | `BAPI2021_AMOUNTS` |  |  |
| IMPORTING | `CENTRAL_BANK_REP` | `BAPI2021_CENTRALBANKREP` | ✓ |  |
| IMPORTING | `CORR_DOC` | `BAPI2021_CORRDOC` | ✓ |  |
| IMPORTING | `INSTRUCTIONS` | `BAPI2021_INSTRUCTIONS` | ✓ |  |
| IMPORTING | `ORGANISATIONS` | `BAPI2021_ORGANISATIONS` |  |  |
| IMPORTING | `ORIGIN` | `BAPI2021_ORIGIN` |  |  |
| IMPORTING | `PAYM_CONTROL` | `BAPI2021_PAYMENTCTRL` |  |  |
| IMPORTING | `REFERENCES` | `BAPI2021_REFERENCES` | ✓ |  |
| IMPORTING | `RELEASEPAY` | `BAPI2021_HELP-RELEASEPAY` | ✓ | 'X' |
| IMPORTING | `RELEASEPOST` | `BAPI2021_HELP-RELEASEPOST` | ✓ | 'X' |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| IMPORTING | `VALUE_DATES` | `BAPI2021_DATES` |  |  |
| EXPORTING | `REQUESTID` | `BAPI2021_KEYNO-REQUESTID` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `ADDRESS_DATA` | `BAPI2021_ADDRESS` |  |  |
| TABLES | `BANK_DATA` | `BAPI2021_BANK` | ✓ |  |
| TABLES | `EXTENSIONIN` | `BAPIPAREX` | ✓ |  |
| TABLES | `REFERENCE_TEXT` | `BAPI2021_REFTEXT` | ✓ |  |

## `BAPI_PAYMENTREQUEST_GETLIST`

List of Payment Requests with Selections

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `MAXROWS` | `BAPI2021_HELP-BAPIMAXROW` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `LIST_REQUESTID` | `BAPI2021_LIST` | ✓ |  |
| TABLES | `SEL_AC_DOC_NO` | `BAPI2021_SELACDOCNO` | ✓ |  |
| TABLES | `SEL_CLR_DOC_NO` | `BAPI2021_SELCLRDOCNO` | ✓ |  |
| TABLES | `SEL_COMP_CODE` | `BAPI2021_SELCOMPCODE` | ✓ |  |
| TABLES | `SEL_FISC_YEAR` | `BAPI2021_SELFISCYEAR` | ✓ |  |
| TABLES | `SEL_ITEM_NUM` | `BAPI2021_SELITEMNUM` | ✓ |  |
| TABLES | `SEL_LOGSYSTEM` | `BAPI2021_SELLOGSYST` | ✓ |  |
| TABLES | `SEL_OBJ_KEY` | `BAPI2021_SELOBJKEY` | ✓ |  |
| TABLES | `SEL_OBJ_TYPE` | `BAPI2021_SELOBJTYPE` | ✓ |  |
| TABLES | `SEL_ORIGIN` | `BAPI2021_SELORI` | ✓ |  |

## `BAPI_PAYMENTREQUEST_GETSTATUS`

Determination of Payment Request Status

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REQUESTID` | `BAPI2021_KEYNO-REQUESTID` |  |  |
| EXPORTING | `REQUEST_STATUS` | `BAPI2021_STA-REQUESTSTATUS` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_PAYMENTREQUEST_POST`

Posting a Parked Payment Request

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REQUESTID` | `BAPI2021_KEYNO-REQUESTID` |  |  |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_PAYMENTREQUEST_RELEASE`

Payment Request Released for Payment

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `REQUESTID` | `BAPI2021_KEYNO-REQUESTID` |  |  |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |

## `BAPI_PAYMENTREQ_STARTPAYMENT`

Start Payment of Payment Request

- Function group `2021` · package `FMZA` · component `FI-BL-PT-AP`
- Remote-enabled: yes (`FMODE = R`)
- Release: released for customer use (`RODIR.RELEASED = X`)

| Kind | Parameter | Type | Opt | Default |
|---|---|---|:--:|---|
| IMPORTING | `NEXT_DATE` | `BAPI2021_PAY-NEXT_DATE` | ✓ | '99991231' |
| IMPORTING | `PAYMENT_RUN_LOG` | `BAPI2021_PAY-PAYMENT_RUN_LOG` | ✓ |  |
| IMPORTING | `PSTNG_DATE` | `BAPI2021_PAY-PSTNG_DATE` | ✓ | SY-DATUM |
| IMPORTING | `TESTRUN` | `BAPI2021_HELP-TESTRUN` | ✓ |  |
| IMPORTING | `USE_PAYMENT_MEDIUM_TOOL` | `BAPI2021_PAY-USE_PAYMENT_MEDIUM_TOOL` | ✓ |  |
| EXPORTING | `PAYMENT_RUN_DATE` | `BAPI2021_PAY-PAYMENT_RUN_DATE` |  |  |
| EXPORTING | `PAYMENT_RUN_ID` | `BAPI2021_PAY-PAYMENT_RUN_ID` |  |  |
| EXPORTING | `RETURN` | `BAPIRET2` |  |  |
| TABLES | `REPORTS` | `BAPI2021_REPORTS` | ✓ |  |
| TABLES | `REQUESTID` | `BAPI2021_SELREQUESTID` |  |  |

