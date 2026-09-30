@EndUserText.label: 'ALM 2/3 TRM principal outstanding'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_FS_ALM_TRMPRIN_QUERY'
// /FS00/ALMR015 as an API: principal outstanding of the money-market deals and securities of a
// company code at the end of P_FiscalYear/P_FiscalPeriod (calendar month), in the ten ALM 2/3 buckets (INR).
define custom entity ZFS_CE_AlmTrmPrincipal
  with parameters
    P_CompanyCode  : bukrs,
    P_FiscalYear   : /fs00/almdt0032,
    P_FiscalPeriod : /fs00/almdt0031
{
  key CompanyCode           : bukrs;
  key DealNumber            : tb_rfha;
  key SecurityId            : vvranlw;
      Activity              : tb_xttext;
      ProductType           : vvsart;
      ProductTypeText       : bu_title_let;
      TransactionType       : tb_sfhaart;
      TransactionTypeText   : bu_title_let;
      Customer              : tb_kunnr_new;
      CustomerName          : bu_title_let;
      StartDate             : tb_dblfz;
      EndDate               : tb_delfz;
      ReferenceInterestRate : szsref;
      FixedOrVariable       : abap.char(20);
      OutstandingAmount     : abap.dec(23,2);
      RepaymentDate         : abap.dats;
      Bucket01              : abap.dec(23,2);
      Bucket02              : abap.dec(23,2);
      Bucket03              : abap.dec(23,2);
      Bucket04              : abap.dec(23,2);
      Bucket05              : abap.dec(23,2);
      Bucket06              : abap.dec(23,2);
      Bucket07              : abap.dec(23,2);
      Bucket08              : abap.dec(23,2);
      Bucket09              : abap.dec(23,2);
      Bucket10              : abap.dec(23,2);
      Total                 : abap.dec(23,2);
      // X: the TPM12 position values could not be captured; the row is kept with Total 0.
      Tpm12CaptureFailed    : abap_boolean;
}
