*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR021_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr021.

TYPES : BEGIN OF ty_data,
          gsart                   TYPE vvsart,
          product_type_desc       TYPE text30,
          ranl                    TYPE vvranlw,
          ranl_ln                 TYPE xallb,
          isin                    TYPE vvranlwx,
          units                   TYPE tpm_units,
          investor                TYPE tb_kunnr_new,
          name_org1               TYPE bu_nameor1,
          grp_key                 TYPE bp_grp,
          segment                 TYPE char3,
          alm_segment             TYPE char20,
          os_amt_total            TYPE tpm_amount,
          os_amt                  TYPE tpm_amount,
          bkt_dt                  TYPE dats,
          bkt_no                  TYPE char2,
          days                    TYPE i,
          recdate                 TYPE dats,
          source                  TYPE /fs00/almdt0004,
          src_desc                TYPE /fs00/almdt0005,
          face_value              TYPE tpm_amount,
          share                   TYPE tpm_amount,
          total_issue_size        TYPE tpm_amount,
          os_perc                 TYPE pkond,
          premium_to_be_amortized TYPE tpm_amount,
          amort002                TYPE tpm_amount,
          amort_issue             TYPE tpm_amount,
          portfolio               TYPE rportb,
        END OF ty_data,
        BEGIN OF ty_cf,
          os_guid          TYPE tpm_db_os_guid,
          bustranscat      TYPE tpm_bustranscat,
          trldate          TYPE tpm_trldate,
          bustransid       TYPE tpm_bustransid,
          booking_state    TYPE tpm_trl_bookingstate,
          flowtype         TYPE tpm_dis_flowtype,
          dis_flowtypetext TYPE tpm_dft_text,
          zfs_flow         TYPE zdt_flow_cat,
          units            TYPE tpm_units_l,
          nominal_amt      TYPE tpm_nominal_amt,
          nominal_curr     TYPE tpm_nominal_curr,
          position_amt     TYPE tpm_position_amt,
          position_curr    TYPE tpm_position_curr,
          valuation_amt    TYPE tpm_valuation_amt,
          valuation_curr   TYPE tpm_valuation_curr,
          valuation_area   TYPE tpm_val_area,
          valuation_class  TYPE tpm_val_class,
          company_code     TYPE bukrs,
          product_type     TYPE vvsart,
          security_id      TYPE vvranlw,
          lot_id           TYPE tpm_lot_id,
          deal_number      TYPE tb_rfha,
          fi_post_date     TYPE dats,
          portfolio        TYPE rportb,
        END OF ty_cf,
        BEGIN OF ty_r0214,
          ranl        TYPE ranl,
          pos_date    TYPE dats,
          update_type TYPE tpm_dis_flowtype,
          flowtype_t  TYPE text80,
          amt         TYPE tb_limit_amount,
          calc_frm    TYPE dats,
          calc_to     TYPE dats,
          days        TYPE atage,
          xirr        TYPE trff_type_dec4float,
          factor      TYPE p DECIMALS 14,
          dis_amt     TYPE tb_limit_amount,
          rev_amt     TYPE tb_limit_amount,
        END OF ty_r0214.

DATA: gt_data  TYPE TABLE OF ty_data,
      gs_data  LIKE LINE OF gt_data,
      gt_cf    TYPE TABLE OF ty_cf,
      gt_r0214 TYPE TABLE OF ty_r0214,
      gt_tpm12 TYPE TABLE OF trls_position_value_attr_txt,
      gt_buck  TYPE /fs00/almtt001,
      gt_tr008 TYPE TABLE OF /fs00/almtr008.
DATA: gt_dat TYPE REF TO data.
FIELD-SYMBOLS: <fs_dat> TYPE ANY TABLE.
DATA: gr_prd  TYPE RANGE OF vvsart,
      gr_ranl TYPE RANGE OF vvranlw.
DATA: gv_month_st  TYPE dats,
      gv_month_end TYPE dats,
      gv_amt_div   TYPE i.
DATA : gt_fcat    TYPE lvc_t_fcat,
       gs_layout  TYPE lvc_s_layo,
       gs_variant TYPE disvariant.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
              p_month TYPE n LENGTH 2 OBLIGATORY,
              p_year  TYPE n LENGTH 4 OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN : BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  SELECT-OPTIONS: so_ranl FOR gs_data-ranl.
  PARAMETERS: p_src TYPE /fs00/almdt0004.
SELECTION-SCREEN : END OF BLOCK b2.
SELECTION-SCREEN : BEGIN OF BLOCK b5 WITH FRAME TITLE TEXT-005.
  PARAMETERS: rb_cp  RADIOBUTTON GROUP rbg1 DEFAULT 'X',
              rb_ncd RADIOBUTTON GROUP rbg1.
SELECTION-SCREEN : END OF BLOCK b5.
SELECTION-SCREEN : BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-004.
  PARAMETERS: rb1 RADIOBUTTON GROUP rbg2,
              rb2 RADIOBUTTON GROUP rbg2,
              rb3 RADIOBUTTON GROUP rbg2,
              rb4 RADIOBUTTON GROUP rbg2 DEFAULT 'X'.
SELECTION-SCREEN : END OF BLOCK b4.
SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS: p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b3.