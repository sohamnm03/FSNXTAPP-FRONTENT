*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR018_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr018.

TYPES: BEGIN OF ty_data,
         company_code    TYPE bukrs,
         product_type    TYPE vvsart,
         product_desc    TYPE text30,
         deal_number     TYPE tb_rfha,
         security_id     TYPE vvranlw,
         bpartner        TYPE bu_partner,
         name_org1       TYPE bu_nameor1,
         start_dt        TYPE dats,
         end_dt          TYPE dats,
         bkt_dt          TYPE dats,
         os_amt          TYPE tpm_amount,
         market_value    TYPE tpm_amount,
         book_val_pc     TYPE tpm_amount,
         gen_class       TYPE char50,
         xlangbez        TYPE xlangbez,
         lot_id          TYPE tpm_lot_id_ext,
         valuation_class TYPE tpm_val_class,
       END OF ty_data.
DATA: gt_tpm12       TYPE TABLE OF trls_position_value_attr_txt,
      gs_tpm12       LIKE LINE OF gt_tpm12,
      gt_tpm13_purch TYPE TABLE OF /fs00/cds0002,
      gt_val_class_t TYPE TABLE OF trgc_val_class_t,
      gt_cds0004     TYPE TABLE OF /fs00/cds0004.
DATA: gv_lastdaym TYPE dats,
      gv_nextdate TYPE dats,
       gv_amt_div TYPE i.
DATA: gr_prd TYPE RANGE OF vvsart.
DATA: gt_buck  TYPE /fs00/almtt001,
      gt_tr005 TYPE TABLE OF /fs00/almtr005,
      rft_data TYPE REF TO data,
      rf_data  TYPE REF TO data.
FIELD-SYMBOLS: <gt_data> TYPE STANDARD TABLE.
DATA : gt_fcat    TYPE lvc_t_fcat,
       gs_layout  TYPE lvc_s_layo,
       gs_variant TYPE disvariant.

SELECTION-SCREEN : BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
              p_month TYPE char2 OBLIGATORY,
              p_year  TYPE char4 OBLIGATORY.
SELECTION-SCREEN : END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  SELECT-OPTIONS : so_prd FOR gs_tpm12-product_type,
                   so_ranl FOR gs_tpm12-security_id,
                   so_rfha FOR gs_tpm12-deal_number.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN : BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-004."--Value Conversion
  PARAMETERS : rb1 RADIOBUTTON GROUP rbg2 ,               "--value in cr
               rb2 RADIOBUTTON GROUP rbg2,                "--value in lakhs
               rb3 RADIOBUTTON GROUP rbg2,                "--value in thousands
               rb4 RADIOBUTTON GROUP rbg2 DEFAULT 'X'.    "--value in inr
SELECTION-SCREEN : END OF BLOCK b4.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS: p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b3.