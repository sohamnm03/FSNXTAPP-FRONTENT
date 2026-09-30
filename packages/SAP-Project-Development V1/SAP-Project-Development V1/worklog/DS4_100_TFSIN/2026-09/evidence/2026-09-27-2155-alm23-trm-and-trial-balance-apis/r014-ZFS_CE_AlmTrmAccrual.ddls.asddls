@EndUserText.label: 'ALM 2/3 TRM accrual cash flows'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_ALM_TRMACCR_QUERY'
// /FS00/ALMR014 as an API: the interest accrued up to the end of month P_FiscalPeriod of year
// P_FiscalYear per money-market deal or security, placed in the ALM 2/3 bucket of its next
// interest payout (FL11) posted after the month end. Amounts in INR, unconverted.
define custom entity ZFS_CE_AlmTrmAccrual
  with parameters
    P_CompanyCode  : bukrs,
    P_FiscalYear   : /fs00/almdt0032,
    P_FiscalPeriod : /fs00/almdt0031
{
  key CompanyCode         : bukrs;
  key DealNumber          : tb_rfha;
  key SecurityId          : vvranlw;
      Activity            : tb_xttext;
      ProductType         : vvsart;
      ProductTypeText     : bu_title_let;
      TransactionType     : tb_sfhaart;
      TransactionTypeText : bu_title_let;
      Customer            : tb_kunnr_new;
      CustomerName        : bu_title_let;
      StartDate           : tb_dblfz;
      EndDate             : tb_delfz;
      InterestPayoutDate  : abap.dats;
      Bucket01            : abap.dec(23,2);
      Bucket02            : abap.dec(23,2);
      Bucket03            : abap.dec(23,2);
      Bucket04            : abap.dec(23,2);
      Bucket05            : abap.dec(23,2);
      Bucket06            : abap.dec(23,2);
      Bucket07            : abap.dec(23,2);
      Bucket08            : abap.dec(23,2);
      Bucket09            : abap.dec(23,2);
      Bucket10            : abap.dec(23,2);
      Total               : abap.dec(23,2);
}
