# TRM BAPI catalogue (Treasury and Risk Management)

Extracted from **DS4 / client 100 (DS4_100_NIIF)** on 2026-09-14. 380 BAPIs, 377 remote-enabled (`TFDIR-FMODE = R`), 339 released for customer use (`RODIR`), 1 flagged obsolete.

`Rel` column: ✓ = released in `RODIR`, — = **not** in the released-objects directory (SAP-internal, no compatibility guarantee), **OBSOLETE** = released but marked obsolete.

Full signatures: [trm-bapis-signatures.md](trm-bapis-signatures.md) · machine-readable: [`json/trm-bapis.json`](json/trm-bapis.json)

| Function group | BAPI | RFC | Rel | Description |
|---|---|:--:|:--:|---|
| `1062` | `BAPI_EXTSECACCSTMNT_CREATE` | ✓ | ✓ | Create External Securities Account Statement |
| `1064` | `BAPI_RED_FACTOR_CHANGE` | ✓ | ✓ | BAPI: Create or Change a Redemption Factor |
| `1064` | `BAPI_RED_FACTOR_CREATE` | ✓ | ✓ | BAPI: Create Redemption Factor Header + Factors |
| `1064` | `BAPI_RED_FACTOR_GET_DETAIL` | ✓ | ✓ | BAPI: Read Redemption Factors for a Security ID |
| `1074` | `BAPI_RSS_ADD_SCHEDULE` | ✓ | ✓ | Create Redemption Schedules for Redemption Schedule Sets |
| `1074` | `BAPI_RSS_CHANGE_SCHEDULE` | ✓ | ✓ | Change Repayment Schedule Data |
| `1074` | `BAPI_RSS_CREATE` | ✓ | ✓ | Create Redemption Schedule Sets |
| `1074` | `BAPI_RSS_GET_DETAIL` | ✓ | ✓ | Read Redemption Schedules for Redemption Schedule Sets |
| `1074` | `BAPI_RSS_GET_LIST` | ✓ | ✓ | Read Header Data for Redemption Schedule Sets |
| `1074` | `BAPI_RSS_UPDATE_FACTOR` | ✓ | ✓ | Update Redemption in Redemption Schedule Data |
| `1076` | `BAPI_FP_CHANGE` | ✓ | ✓ | Change Security |
| `1076` | `BAPI_FP_CREATEFROMDATA` | ✓ | ✓ | Create Security |
| `1076` | `BAPI_FP_GETDETAIL` | ✓ | ✓ | Read Detail Data for Securities |
| `1076` | `BAPI_FP_GETLIST` | ✓ | ✓ | Read security list |
| `FTBAS_IB_BAPI` | `BAPI_IB_VERSION_CREATE` | ✓ | ✓ | Create Redemption Schedule Version |
| `FTBAS_IB_BAPI` | `BAPI_IB_VERSION_DELETE` | ✓ | ✓ | Delete a Redemption Schedule Version |
| `FTBAS_IB_BAPI` | `BAPI_IB_VERSION_GETALLVERSIONS` | ✓ | ✓ | Get all Redemption Schedule Versions |
| `FTBAS_IB_BAPI` | `BAPI_IB_VERSION_GETDETAIL` | ✓ | ✓ | Get Redemption Schedule Version |
| `FTBAS_IB_BAPI` | `BAPI_IB_VERSION_GETVERSNUMBER` | ✓ | ✓ | Get Number of Redemption Schedule Version Valid on Key Date |
| `FTR_BAPI_ADDFLOW` | `BAPI_FTR_ADDFLOW_CHANGE` | ✓ | ✓ | Change Other Flow |
| `FTR_BAPI_ADDFLOW` | `BAPI_FTR_ADDFLOW_CREATE` | ✓ | ✓ | Create Ôther Flow |
| `FTR_BAPI_ADDFLOW` | `BAPI_FTR_ADDFLOW_DELETE` | ✓ | ✓ | Delete Other Flow |
| `FTR_BAPI_ADDFLOW` | `BAPI_FTR_ADDFLOW_GETLIST` | ✓ | ✓ | List of Other Flows |
| `FTR_BAPI_ADDFLOW` | `BAPI_FTR_ADDFLOW_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Other Flows |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_CHANGE` | ✓ | ✓ | Change Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_CREATE` | ✓ | ✓ | Create Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_DEALCHANGE` | ✓ | ✓ | Completely change Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_DEALCREATE` | ✓ | ✓ | Completely create Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_DEALGET` | ✓ | ✓ | Completely display Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_GETDETAIL` | ✓ | ✓ | Details of Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ORDERCHANGE` | ✓ | ✓ | Completely change Bank Guarantee order |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ORDERCREATE` | ✓ | ✓ | Completely create Bank Guarantee order |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ORDEREXECUTE` | ✓ | ✓ | Execute Bank Guarantee order |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ORDEREXPIRE` | ✓ | ✓ | Expire Bank Guarantee order |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ORDERGET` | ✓ | ✓ | Completely display Bank Guarantee order |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_REVERSE` | ✓ | ✓ | Reverse Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_ROLLOVER` | ✓ | ✓ | Rollover Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_SETTLE` | ✓ | ✓ | Settle Bank Guarantee |
| `FTR_BAPI_BG` | `BAPI_FTR_BG_TERMINATE` | ✓ | ✓ | Terminate Bank Guarantee |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_CHANGE` | ✓ | ✓ | Change Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_CREATE` | ✓ | ✓ | Create Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_DEALCHANGE` | ✓ | ✓ | Completely Change a Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_DEALCREATE` | ✓ | ✓ | Completely Create a Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_DEALGET` | ✓ | ✓ | Completely Display a Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_GETDETAIL` | ✓ | ✓ | Read Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_GIVENOTICE` | ✓ | ✓ | Give Notice on Interest Rate Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_REVERSE` | ✓ | ✓ | Reverse Current Acct-Style Instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_ROLLOVER` | ✓ | ✓ | Rollover Current Acct-Style instrument |
| `FTR_BAPI_CAI` | `BAPI_FTR_CAI_SETTLE` | ✓ | ✓ | Settle Current Acct-Style Instrument |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_CHANGE` | ✓ | ✓ | Change OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_CREATE` | ✓ | ✓ | Create OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_GETDETAIL` | ✓ | ✓ | Display OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_GIVENOTICE` | ✓ | ✓ | Give Notice on OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_REVERSE` | ✓ | ✓ | Reverse an OTC Interest Rate Derivative Cap/Floor |
| `FTR_BAPI_CAPFLOOR` | `BAPI_FTR_CAPFLOOR_SETTLE` | ✓ | ✓ | Settle an OTC Interest Derivative Cap/Floor |
| `FTR_BAPI_CASHFLOW` | `BAPI_FTR_CASHFLOW_CHANGE` | ✓ | ✓ | Change Cash Flow |
| `FTR_BAPI_CASHFLOW` | `BAPI_FTR_CASHFLOW_GETDETAIL` | ✓ | ✓ | List of Cash Flow |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_CHANGE` | ✓ | ✓ | Change Cash Flow-Dependent Transaction |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_CREATE` | ✓ | ✓ | Create Cash Flow-Dependent Transaction |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_FLOW_CHANGE` | ✓ | ✓ | Change a Cash Flow |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_FLOW_CREATE` | ✓ | ✓ | Create a Cash Flow |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_FLOW_DELETE` | ✓ | ✓ | Delete Cash Flow |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_FLOW_GETLIST` | ✓ | ✓ | List of Cash Flows |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_FLOW_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Cash Flow |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_GETDETAIL` | ✓ | ✓ | Details of a Cash Flow-Dependent Transaction |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Cash Flow-Dependent Transactions |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_REVERSE` | ✓ | ✓ | Reverse Cash Flow-Dependent Transaction |
| `FTR_BAPI_CFT` | `BAPI_FTR_CFT_SETTLE` | ✓ | ✓ | Settle Cash Flow-Dependent Transaction |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_CHANGE` | ✓ | ✓ | Change a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_COND_DEALCHANGE` | ✓ | ✓ | Completely Change a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_COND_DEALCREATE` | ✓ | ✓ | Completely Create a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_COND_DEALGET` | ✓ | ✓ | Completely Display a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_CREATE` | ✓ | ✓ | Create a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_DEALCHANGE` | ✓ | ✓ | Completely Change a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_DEALCREATE` | ✓ | ✓ | Completely Create a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_DEALGET` | ✓ | ✓ | Completely Display a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_GETDETAIL` | ✓ | ✓ | Display a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_GIVENOTICE` | ✓ | ✓ | Give Notice a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_REVERSE` | ✓ | ✓ | Reverse a Commodity Swap |
| `FTR_BAPI_COMS` | `BAPI_FTR_COMS_SETTLE` | ✓ | ✓ | Settle a Commodity Swap |
| `FTR_BAPI_CONDITION` | `BAPI_FTR_CONDITION_CHANGE` | ✓ | ✓ | RFC for Method Condition.Change |
| `FTR_BAPI_CONDITION` | `BAPI_FTR_CONDITION_CREATE` | ✓ | ✓ | RFC for Method Condition Creation |
| `FTR_BAPI_CONDITION` | `BAPI_FTR_CONDITION_DELETE` | ✓ | ✓ | RFC for Method Condition.Delete |
| `FTR_BAPI_CONDITION` | `BAPI_FTR_CONDITION_GETLIST` | ✓ | ✓ | RFC for Method Condition.GetList |
| `FTR_BAPI_CONDITION` | `BAPI_FTR_CONDITON_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Condition Details |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_CHANGE` | ✓ | ✓ | Change Commercial Paper |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_CREATE` | ✓ | ✓ | Create Commercial Paper |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_GETDETAIL` | ✓ | ✓ | Details of Commercial Paper |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_GET_FIELD_MAPPING` | — | — | Access to the Product Category-Specific Mapping Table |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Commercial Paper |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_REVERSE` | ✓ | ✓ | Reverse Commercial Paper |
| `FTR_BAPI_CP` | `BAPI_FTR_CP_SETTLE` | ✓ | ✓ | Settle Commercial Paper |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_CTY_OTCOPT_DEALCHANGE` | ✓ | ✓ | Change commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_CTY_OTCOPT_DEALCREATE` | ✓ | ✓ | Create commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_CTY_OTCOPT_DEALGET` | ✓ | ✓ | Get details of Commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_EXERCISE_CTY_OTCOPT` | ✓ | ✓ | Exercise Commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_EXPIRE_CTY_OTCOPT` | ✓ | ✓ | Expire Commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_REVERSE_CTY_OTCOPT` | ✓ | ✓ | Reverse Commodity OTC Options |
| `FTR_BAPI_CTYOPTIONS` | `BAPI_FTR_SETTLE_CTY_OTCOPT` | ✓ | ✓ | Settle Commodity OTC Options |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_CHANGE` | ✓ | ✓ | Change Commodity Forward |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_CREATE` | ✓ | ✓ | Create Commodity Forward |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_DEALCHANGE` | ✓ | ✓ | Completely Change a Forex Transaction |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_DEALCREATE` | ✓ | ✓ | Completely Create a Forex Transaction |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_DEALGET` | ✓ | ✓ | Completely Display a Forex Transaction |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_GETDETAIL` | ✓ | ✓ | Display Commodity Forward |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of Commodity Forward |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_REVERSE` | ✓ | ✓ | Reverse Commodity Forward |
| `FTR_BAPI_CTY_OTC` | `BAPI_FTR_CTYFWD_SETTLE` | ✓ | ✓ | Settle Commodity Forward |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_CHANGE` | ✓ | ✓ | Change Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_CREATE` | ✓ | ✓ | Create Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_GETDETAIL` | ✓ | ✓ | Details of Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_GIVENOTICE` | ✓ | ✓ | Give Notice on Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Deposits at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_REVERSE` | ✓ | ✓ | Reverse Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_ROLLOVER` | ✓ | ✓ | Roll Over Deposit at Notice |
| `FTR_BAPI_DAN` | `BAPI_FTR_DAN_SETTLE` | ✓ | ✓ | Settle Deposit at Notice |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_CHANGE` | ✓ | ✓ | Change Facility |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_CREATE` | ✓ | ✓ | Create Facility |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_DEALCHANGE` | ✓ | ✓ | Completely Create a Facility Transaction |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_DEALCREATE` | ✓ | ✓ | Completely Create a Facility Transaction |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_DEALGET` | ✓ | ✓ | Completely Display a Facility |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_GETDETAIL` | ✓ | ✓ | Retrieve facility transaction data |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_REVERSE` | ✓ | ✓ | Reverse a Facility Transaction |
| `FTR_BAPI_FAC` | `BAPI_FTR_FAC_SETTLE` | ✓ | ✓ | Settle a Facility Transaction |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_CHANGE` | ✓ | ✓ | Change a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_CREATE` | ✓ | ✓ | Create a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_DEALCHANGE` | ✓ | ✓ | Completely Change a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_DEALCREATE` | ✓ | ✓ | Completely Create a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_DEALGET` | ✓ | ✓ | Completely Display a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_GETDETAIL` | ✓ | ✓ | Display a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_REVERSE` | ✓ | ✓ | Reverse a Forward Loan |
| `FTR_BAPI_FLP` | `BAPI_FTR_FLP_SETTLE` | ✓ | ✓ | Settle a Forward Loan |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_ADVANCE_MATURITY` | ✓ | ✓ | Advance Maturity Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_CHANGE` | ✓ | ✓ | Change Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_CREATE` | ✓ | ✓ | Create Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_DEALCHANGE` | ✓ | ✓ | Completely Change a Future Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_DEALCREATE` | ✓ | ✓ | Completely Create a Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_DEALGET` | ✓ | ✓ | Completely Display a Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_DELIVERY` | ✓ | ✓ | Delivery Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_GETDETAIL` | ✓ | ✓ | Display Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_REVERSE` | ✓ | ✓ | Reverse Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_ROLLOVER` | ✓ | ✓ | Rollover Forward Security |
| `FTR_BAPI_FORWARDS` | `BAPI_FTR_FST_SETTLE` | ✓ | ✓ | Settle Forwar Security |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_CHANGE` | ✓ | ✓ | Change an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_CREATE` | ✓ | ✓ | Create an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_GETDETAIL` | ✓ | ✓ | Display an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_GIVENOTICE` | ✓ | ✓ | Give Notice on an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_REVERSE` | ✓ | ✓ | Reverse an OTC Interest Rate Derivative FRA |
| `FTR_BAPI_FRA` | `BAPI_FTR_FRA_SETTLE` | ✓ | ✓ | Settle an OTC Interest Derivative FRA |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_CHANGE` | ✓ | ✓ | Change Fixed-Term Deposit |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_CREATE` | ✓ | ✓ | Create Fixed-Term Deposit |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_DEALCHANGE` | ✓ | ✓ | Completely Change a Fixed Term Deposit |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_DEALCREATE` | ✓ | ✓ | Create a Fixed Term Deposit Completely |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_DEALGET` | ✓ | ✓ | Completely Display a Fixed Term Deposit |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_GETDETAIL` | ✓ | ✓ | Details of Fixed-Term Deposit |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Fixed-Term Deposits |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_REVERSE` | ✓ | ✓ | Reverse Fixed-Term Deposit per BAPI |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_ROLLOVER` | ✓ | ✓ | Rollover of a fixed-term deposit per BAPI |
| `FTR_BAPI_FTD` | `BAPI_FTR_FTD_SETTLE` | ✓ | ✓ | Settle Fixed-Term Deposit per BAPI |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_CHANGE` | ✓ | ✓ | Change a Future |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_CREATE` | ✓ | ✓ | Create a Future |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_GETDETAIL` | ✓ | ✓ | Details of a Future |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Futures |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_REVERSE` | ✓ | ✓ | Reverse a Future |
| `FTR_BAPI_FUTURE` | `BAPI_FTR_FUTURE_SETTLE` | ✓ | ✓ | Settle a Future |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CHANGE_FWD_FXVA` | ✓ | ✓ | Create Currency Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CHANGE_FXOPTIONS` | ✓ | ✓ | Change an FX Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CHANGE_FXOPTIONS_CRL` | ✓ | ✓ | Change a Basket/Correlation Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CREATE_FWD_FXVA` | ✓ | ✓ | Create a Forward Volatility Agreement |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CREATE_FXOPTIONS` | ✓ | ✓ | Create Currency Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CREATE_FXOPTIONS_AVG` | ✓ | ✓ | Create Average Rate Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_CREATE_FXOPTIONS_CRL` | ✓ | ✓ | Create Basket/Correlation Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_EXERCISE_FXOPTIONS` | ✓ | ✓ | Exercise FX Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_EXPIRE_FXOPTIONS` | ✓ | ✓ | Allow FX Option to Expire |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_FXOPTION_GETDETAIL` | ✓ | ✓ | Details on FX Options |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_FXOPTION_GETDETAILCRL` | ✓ | ✓ | Details on FX Options |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_FXOPTION_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for FX Options |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_GETDETAIL_FWD_FXFVA` | ✓ | ✓ | Details on FX Options |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_KNOCKIN_FXOPTIONS` | ✓ | ✓ | Knock-In FXOPTION |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_KNOCKOUT_FXOPTIONS` | ✓ | ✓ | Knock-Out FXOPTIONS |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_REVERSE_FXOPTIONS` | ✓ | ✓ | Reverse FX Option |
| `FTR_BAPI_FXOPTIONS` | `BAPI_FTR_SETTLE_FXOPTIONS` | ✓ | ✓ | Settle FX OPTION |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_CHANGE` | ✓ | ✓ | Change a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_CREATE` | ✓ | ✓ | Create a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_CREATESWAP` | ✓ | ✓ | Create a Foreign Currency Swap |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_DEALCHANGE` | ✓ | ✓ | Completely Change a Forex Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_DEALCREATE` | ✓ | ✓ | Completely Create a Forex Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_DEALGET` | ✓ | ✓ | Completely Display a Forex Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_GETDETAIL` | ✓ | ✓ | Display a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_NDF_FIXING` | ✓ | ✓ | Settle a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_ORDERCHANGE` | ✓ | ✓ | Completely Change a Forex Transaction Order |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_ORDERCREATE` | ✓ | ✓ | Completely Create a Forex Transaction Order |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_ORDEREXECUTE` | ✓ | ✓ | Execute a Foreign Exchange Transaction Order |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_ORDEREXPIRE` | ✓ | ✓ | Expire a Foreign Exchange Transaction Order |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_ORDERGET` | ✓ | ✓ | Completely Display a Forex Transaction Order |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_REVERSE` | ✓ | ✓ | Reverse a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_SETTLE` | ✓ | ✓ | Settle a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_FXT_TERMINATE` | ✓ | — | Settle a Foreign Exchange Transaction |
| `FTR_BAPI_FXT` | `BAPI_FTR_GIVENOTICE_FXOPTIONS` | ✓ | — | Give Notice/Terminate FX Option |
| `FTR_BAPI_HEDGE_MGMT` | `BAPI_FTR_HM_CREATE` | ✓ | ✓ | BAPI to Create Hedge Management Data for a Transaction |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_CHANGE` | ✓ | ✓ | Change Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_CREATE` | ✓ | ✓ | Create Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_DEALCHANGE` | ✓ | ✓ | Completely Change an Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_DEALCREATE` | ✓ | ✓ | Completely Create an Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_DEALGET` | ✓ | ✓ | Completely Display an Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_GETDETAIL` | ✓ | ✓ | Get Details of Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_GIVENOTICE` | ✓ | ✓ | Give Notice on Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Interest Rate Instruments |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_REVERSE` | ✓ | ✓ | Reverse Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_ROLLOVER` | ✓ | ✓ | Roll Over Interest Rate Instrument |
| `FTR_BAPI_IRATE` | `BAPI_FTR_IRATE_SETTLE` | ✓ | ✓ | Settle Interest Rate Instrument |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_CHANGE` | ✓ | ✓ | Change Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_CREATE` | ✓ | ✓ | Create Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_DEALCHANGE` | ✓ | ✓ | Completely Change a Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_DEALCREATE` | ✓ | ✓ | Create a Letter of Credit Completely |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_DEALGET` | ✓ | ✓ | Completely Display a Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_GETDETAIL` | ✓ | ✓ | Details of Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ORDERCHANGE` | ✓ | ✓ | Completely Change a Letter of Credit Order |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ORDERCREATE` | ✓ | ✓ | Completely Create a Letter of Credit Order |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ORDEREXECUTE` | ✓ | ✓ | Execute a Letter of Credit Order |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ORDEREXPIRE` | ✓ | ✓ | Expire a Letter of Credit Order |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ORDERGET` | ✓ | ✓ | Completely Display a Letter of Credit Order |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_PRESENT` | ✓ | ✓ | Present Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_REVERSE` | ✓ | ✓ | Reverse Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_ROLLOVER` | ✓ | ✓ | Rollover Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_SETTLE` | ✓ | ✓ | Settle Letter of Credit |
| `FTR_BAPI_LC` | `BAPI_FTR_LC_TERMINATE` | ✓ | ✓ | Terminate Letter of Credit |
| `FTR_BAPI_MAINFLOW` | `BAPI_FTR_MAINFLOW_CHANGE` | ✓ | ✓ | Change Main Flow |
| `FTR_BAPI_MAINFLOW` | `BAPI_FTR_MAINFLOW_CREATE` | ✓ | ✓ | Create Main Flow |
| `FTR_BAPI_MAINFLOW` | `BAPI_FTR_MAINFLOW_DELETE` | ✓ | ✓ | Delete Main Flow |
| `FTR_BAPI_MAINFLOW` | `BAPI_FTR_MAINFLOW_GETLIST` | ✓ | ✓ | List of Flows |
| `FTR_BAPI_MAINFLOW` | `BAPI_FTR_MAINFLOW_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Main Flows |
| `FTR_BAPI_PAYDET` | `BAPI_FTR_PAYDET_CHANGE` | ✓ | ✓ | Change Payment Details |
| `FTR_BAPI_PAYDET` | `BAPI_FTR_PAYDET_CREATE` | ✓ | ✓ | Create Payment Details |
| `FTR_BAPI_PAYDET` | `BAPI_FTR_PAYDET_DELETE` | ✓ | ✓ | Delete Payment Details |
| `FTR_BAPI_PAYDET` | `BAPI_FTR_PAYDET_GETLIST` | ✓ | ✓ | List of Payment Details |
| `FTR_BAPI_PAYDET` | `BAPI_FTR_PAYDET_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Payment Details |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_CHANGE` | ✓ | ✓ | Change a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_CREATE` | ✓ | ✓ | Create a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_DEALCHANGE` | ✓ | ✓ | Completely Change a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_DEALCREATE` | ✓ | ✓ | Completely Create a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_DEALGET` | ✓ | ✓ | Completely Display a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_GETDETAIL` | ✓ | ✓ | Display a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_REVERSE` | ✓ | ✓ | Reverse a Repo |
| `FTR_BAPI_REPO` | `BAPI_FTR_REPO_SETTLE` | ✓ | ✓ | Settle a Repo |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_CHANGE` | ✓ | ✓ | Change a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_CREATE` | ✓ | ✓ | Create a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_DEALCHANGE` | ✓ | ✓ | Completely Change a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_DEALCREATE` | ✓ | ✓ | Completely Create a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_DEALGET` | ✓ | ✓ | Completely Display a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_FIX_PRICE` | ✓ | ✓ | Fix Price of a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_GETDETAIL` | ✓ | ✓ | Details of a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for Securities |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_REVERSE` | ✓ | ✓ | Reverse a Security Transaction |
| `FTR_BAPI_SECURITY` | `BAPI_FTR_SECURITY_SETTLE` | ✓ | ✓ | Settle a Security Transaction |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_CHANGE_SEOPTIONS` | ✓ | — | Change an FX Option |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_CREATE_SEOPTIONS` | ✓ | — | Create Currency Option |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_EXERCISE_SEOPTIONS` | ✓ | — | Exercise FX Option |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_EXPIRE_SEOPTIONS` | ✓ | — | Allow FX Option to Expire |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_KNOCKIN_SEOPTIONS` | ✓ | — | Knockin FXOPTION |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_KNOCKOUT_SEOPTIONS` | ✓ | — | Knockout FXOPTIONS |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_REVERSE_SEOPTIONS` | ✓ | — | Reverse FX Option |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_SEOPTION_GETDETAIL` | ✓ | — | Details on FX Options |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_SEOPTION_PREP_STRUC` | ✓ | — | Determine Changed Fields for FX Options |
| `FTR_BAPI_SEOPTIONS` | `BAPI_FTR_SETTLE_SEOPTIONS` | ✓ | — | Cancel FX OPTION |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_CHANGE` | ✓ | ✓ | Change a Security Lending Transaction |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_CREATE` | ✓ | ✓ | Create a Security Lending Transaction |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_GETDETAIL` | ✓ | ✓ | Security Lending :Get Detail |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_GIVENOTICE` | ✓ | ✓ | Security Lending: Give notice |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of Securities Lending |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_REVERSE` | ✓ | ✓ | Reverse a Security Lending Transaction |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_ROLLOVER` | ✓ | ✓ | Security Lending :Rollover |
| `FTR_BAPI_SL` | `BAPI_FTR_SL_SETTLE` | ✓ | ✓ | Settle a Security Lending Transaction |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_CHANGE` | ✓ | ✓ | Change an OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_CREATE` | ✓ | ✓ | Create an OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_DEALCHANGE` | ✓ | ✓ | Completely Change an Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_DEALCREATE` | ✓ | ✓ | Completely Create an Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_DEALGET` | ✓ | ✓ | Display OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_GETDETAIL` | ✓ | ✓ | Display OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_GIVENOTICE` | ✓ | ✓ | Give Notice on an OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_REVERSE` | ✓ | ✓ | Reverse an OTC Interest Rate Derivative Swap |
| `FTR_BAPI_SWAP` | `BAPI_FTR_SWAP_SETTLE` | ✓ | ✓ | Settle an OTC Interest Derivative Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_ADVANCE_MATURITY` | ✓ | ✓ | Advance Maturity a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_CHANGE` | ✓ | ✓ | Change a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_CREATE` | ✓ | ✓ | Create a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_DEALCHANGE` | ✓ | ✓ | Completely Change a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_DEALCREATE` | ✓ | ✓ | Completely Create a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_DEALGET` | ✓ | ✓ | Completely Display a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_EXERCISE` | ✓ | ✓ | Exercise a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_GETDETAIL` | ✓ | ✓ | Display a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields of a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_REVERSE` | ✓ | ✓ | Reverse a Total Return Swap |
| `FTR_BAPI_TRES` | `BAPI_FTR_TRES_SETTLE` | ✓ | ✓ | Settle a Total Return Swap |
| `FTR_BUS2042` | `BAPI_FTR_CHANGE` | ✓ | ✓ | Change financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_COUNTERCONFIRM` | ✓ | ✓ | Counterconfirm financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_CREATEFROMDATA` | ✓ | ✓ | Create financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_EXECUTE_ORDER` | — | — | Execute order financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_GETDETAIL` | ✓ | ✓ | Read Transaction Detailed Data |
| `FTR_BUS2042` | `BAPI_FTR_GETLIST` | ✓ | ✓ | Read Transaction List |
| `FTR_BUS2042` | `BAPI_FTR_NOVATION` | ✓ | ✓ | Novation financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_PREP_STRUC` | ✓ | ✓ | Determine Changed Fields for General Contract Data |
| `FTR_BUS2042` | `BAPI_FTR_REVERSE` | ✓ | ✓ | Reverse financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_ROLLOVER` | ✓ | — | Roll Over Financial Transaction |
| `FTR_BUS2042` | `BAPI_FTR_SETTLE` | ✓ | ✓ | Settle financial transaction |
| `FTR_BUS2042` | `BAPI_FTR_TERMINATE` | ✓ | — | Terminate Financial Transaction |
| `FTR_BUS2042` | `BAPI_FTR_TRIGGER_CORRES` | ✓ | ✓ | Trigger automatic correspondence |
| `FTR_IRATE` | `BAPI_FTR_CREATE_SECURITY` | — | — | Investments |
| `FTR_TEX_EXPOSURE_BAPI` | `BAPI_TEX_EXPOSURE_CHANGE` | ✓ | ✓ | Change Raw Exposure |
| `FTR_TEX_EXPOSURE_BAPI` | `BAPI_TEX_EXPOSURE_CREATE` | ✓ | ✓ | Create Raw Exposure |
| `FTR_TEX_EXPOSURE_BAPI` | `BAPI_TEX_EXPOSURE_DELETE` | ✓ | **OBSOLETE** | Delete Raw Expsoure |
| `FTR_TEX_EXPOSURE_BAPI` | `BAPI_TEX_EXPOSURE_GETDETAIL` | ✓ | ✓ | Gets Raw Exposure Details |
| `FTR_TEX_EXPOSURE_BAPI` | `BAPI_TEX_EXPOSURE_STARTRELEASE` | ✓ | ✓ | Start Raw Expsoure Release Workflow |
| `JBD_GETR_BAPI` | `BAPI_JBD_GETR_ALL_GET_MULT` | ✓ | — | Grouping of Transaction and Financial Object |
| `JBD_GETR_BAPI` | `BAPI_JBD_GETR_FO_GET_DET_MULT` | ✓ | — | Generic Transaction:  Get Detail Multiple for Financial Objects |
| `JBD_GETR_BAPI` | `BAPI_JBD_GETR_GET_DET_MULT` | ✓ | — | Generic Transaction: Get Detail Multiple |
| `JBD_GETR_BAPI` | `BAPI_JBD_GETR_GET_LIST` | ✓ | — | Generic Transaction: Get List |
| `JBD_LM_BAPI` | `BAPI_JBD_LMB_GET_DET_MULT` | ✓ | — | Limitvorgaben für BA: GetDetail BAPI |
| `JBD_LM_BAPI` | `BAPI_JBD_LM_GET_DET_MULT` | ✓ | — | Limitvorgaben: GetDetail BAPI |
| `JBD_LM_BAPI` | `BAPI_JBD_LM_GET_LIST` | ✓ | — | Limitvorgaben: GetList BAPI |
| `JBD_MDFX_BAPI` | `BAPI_JBD_MDFX_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDFX_BAPI` | `BAPI_JBD_MDFX_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDIR_BAPI` | `BAPI_JBD_MDIR_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDIR_BAPI` | `BAPI_JBD_MDIR_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDIX_BAPI` | `BAPI_JBD_MDIX_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDIX_BAPI` | `BAPI_JBD_MDIX_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDSE_BAPI` | `BAPI_JBD_MDSE_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDSE_BAPI` | `BAPI_JBD_MDSE_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOFX_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOFX_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOIR_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOIR_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOIX_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOIX_GET_LIST` | ✓ | — | Get-List BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOSE_GET_DET_MULT` | ✓ | — | Get Detail BAPI |
| `JBD_MDVO_BAPI` | `BAPI_JBD_MDVOSE_GET_LIST` | ✓ | — | Get-List BAPI |
| `TBAPIA` | `BAPI_SECURITYPRICE_GETDETAIL` | ✓ | ✓ | Import a single security price |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOSURE_CHANGE` | ✓ | ✓ | Change Exposure |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOSURE_CREATE` | ✓ | ✓ | Create Exposures |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOSURE_DELETE` | ✓ | ✓ | Delete Exposure |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOSURE_GETDETAIL` | ✓ | ✓ | Return Exposure Details |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOSURE_RELEASE` | ✓ | ✓ | Release Exposure |
| `TEM_BAPI_EXPOSURE` | `BAPI_TEM_EXPOS_GETLIST` | ✓ | ✓ | Get List of Exposures |
| `THA_BAPI_HEDGE_PLAN` | `BAPI_THA_HEDGEPLAN_CHANGE` | ✓ | ✓ | Change Hedge Plan |
| `THA_BAPI_HEDGE_PLAN` | `BAPI_THA_HEDGEPLAN_CREATE` | ✓ | ✓ | Create Hedge Plan |
| `THA_BAPI_HEDGE_PLAN` | `BAPI_THA_HEDGEPLAN_DELETE` | ✓ | ✓ | Delete Hedge Plan |
| `THA_BAPI_HEDGE_PLAN` | `BAPI_THA_HEDGEPLAN_GETDETAIL` | ✓ | ✓ | Get Details for Hedge Plan |
| `THA_BAPI_TRANS_CO` | `BAPI_THA_TRANS_CO_CHANGE` | ✓ | ✓ | Change Commodity Exposure Transactions |
| `THA_BAPI_TRANS_CO` | `BAPI_THA_TRANS_CO_CREATE` | ✓ | ✓ | Create Individual Commodity Transaction |
| `THA_BAPI_TRANS_CO` | `BAPI_THA_TRANS_CO_DELETE` | ✓ | ✓ | Delete the Commodity exposure |
| `THA_BAPI_TRANS_CO` | `BAPI_THA_TRANS_CO_GETDETAIL` | ✓ | ✓ | Get the details of the Commodity exposure transaction |
| `THA_BAPI_TRANS_FX` | `BAPI_THA_TRANS_FX_CHANGE` | ✓ | ✓ | Change Individual FX Transaction |
| `THA_BAPI_TRANS_FX` | `BAPI_THA_TRANS_FX_CREATE` | ✓ | ✓ | Create Individual FX Transaction |
| `THA_BAPI_TRANS_FX` | `BAPI_THA_TRANS_FX_DELETE` | ✓ | ✓ | Delete Individual FX Transaction |
| `THA_BAPI_TRANS_FX` | `BAPI_THA_TRANS_FX_GETDETAIL` | ✓ | ✓ | Display FX Transactions/Exposures |
| `THA_BAPI_TRANS_IR` | `BAPI_THA_TRANS_IR_CHANGE` | ✓ | ✓ | Change Individual IR Transaction |
| `THA_BAPI_TRANS_IR` | `BAPI_THA_TRANS_IR_CREATE` | ✓ | ✓ | Create Individual IR Transaction |
| `THA_BAPI_TRANS_IR` | `BAPI_THA_TRANS_IR_DELETE` | ✓ | ✓ | Delete Individual IR Transaction |
| `THA_BAPI_TRANS_IR` | `BAPI_THA_TRANS_IR_GETDETAIL` | ✓ | ✓ | Get Details for IR Transaction/Exposure |
| `TPM_TREA_CF_STAT_UPLOAD` | `BAPI_TPM_TREA_CF_STAT_IMPORT` | ✓ | — | RFC for Upload of Statement Items |
| `TTM_OPTION_FX_OPT_BAPI` | `BAPI_FTR_CREATE_FXCOLLAR` | ✓ | ✓ | Create Currency Option |
| `TTM_OPTION_FX_OPT_BAPI` | `BAPI_FTR_FXOPTIONS_DEALCHANGE` | ✓ | ✓ | Change an FX Option |
| `TTM_OPTION_FX_OPT_BAPI` | `BAPI_FTR_FXOPTIONS_DEALCREATE` | ✓ | ✓ | Create Currency Option Deal |
| `TTM_OPTION_FX_OPT_BAPI` | `BAPI_FTR_FXOPTIONS_DEALGET` | ✓ | ✓ | Details on FX Options |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_DEALCHANGE` | ✓ | ✓ | Change Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_DEALCREATE` | ✓ | ✓ | Create Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_DEALGET` | ✓ | ✓ | GetDetail Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_EXERCISE` | ✓ | ✓ | Exercise Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_EXPIRE` | ✓ | ✓ | Expire Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_REVERSE` | ✓ | ✓ | Reverse Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_SETTLE` | ✓ | ✓ | Settle Swaption |
| `TTM_OPTION_SWAPTION_BAPI` | `BAPI_FTR_SWAPTION_TERMINATE` | ✓ | ✓ | Terminate Swaption |
