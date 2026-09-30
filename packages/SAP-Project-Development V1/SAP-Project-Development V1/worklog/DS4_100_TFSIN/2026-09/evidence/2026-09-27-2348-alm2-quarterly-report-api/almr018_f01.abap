*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR018_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .
  DATA: lr_bukrs TYPE RANGE OF bukrs,
        lr_varea TYPE RANGE OF tpm_val_area,
        lt_data  TYPE TABLE OF ty_data.
  FIELD-SYMBOLS: <fs_bkt_dt>       TYPE dats,
                 <fs_os_amt>       TYPE tpm_amount,
                 <fs_bucket_field> TYPE tpm_amount.
  IF so_prd IS NOT INITIAL.
    gr_prd[] = so_prd[].
  ELSE.
    " Get Product Types
    SELECT 'I' AS sign,
           'EQ' AS option,
           zprd_type AS low
      FROM /fs00/almtr026
      INTO CORRESPONDING FIELDS OF TABLE @gr_prd
      WHERE zprinc_alm2 EQ @abap_true.
  ENDIF.
  " Get Outstanding Position Data
  lr_bukrs = VALUE #( ( sign = 'I' option = 'EQ' low = p_bukrs ) ).
  lr_varea = VALUE #( ( sign = 'I' option = 'EQ' low = '001' ) ).
  SUBMIT rtpm_trl_show_position_values WITH p_sec    EQ abap_true
                                       WITH p_dea    EQ abap_true
                                       WITH pm_date  EQ gv_lastdaym
                                       WITH so_bukrs IN lr_bukrs
                                       WITH so_varea IN lr_varea
                                       WITH so_pt    IN gr_prd
                                       WITH so_ranl  IN so_ranl
                                       EXPORTING LIST TO MEMORY AND RETURN.
  IMPORT g_tab_position_value_attr_txt = gt_tpm12 FROM MEMORY ID 'G_TAB_POSITION_VALUE_ATTR_TXT'.
  FREE MEMORY ID 'G_TAB_POSITION_VALUE_ATTR_TXT'.
  SORT gt_tpm12 BY product_type security_id.
  lt_data = CORRESPONDING #( gt_tpm12 ).

  IF so_ranl IS NOT INITIAL.
    DELETE gt_tpm12 WHERE security_id NOT IN so_ranl.
  ENDIF.

  IF so_rfha IS NOT INITIAL.
    DELETE gt_tpm12 WHERE deal_number NOT IN so_rfha.
  ENDIF.

  IF gt_tpm12 IS INITIAL.
    MESSAGE 'No Data Found' TYPE 'S' DISPLAY LIKE 'E'.
    LEAVE LIST-PROCESSING.
  ELSE.
    " TPM13 Purchase Data for 21A - Mutual Funds
    SELECT company_code,
           product_type,
           security_id,
           deal_number,
           trldate,
           zfs_flow,
           lot_id
      FROM /fs00/cds0002
      WHERE company_code EQ @p_bukrs
      AND product_type IN @gr_prd
      AND security_id IN @so_ranl
      AND valuation_area IN @lr_varea
      AND product_type EQ '21A'
      AND zfs_flow EQ 'FI01'
      INTO CORRESPONDING FIELDS OF TABLE @gt_tpm13_purch.

    " Transaction Data for Money Market
    SELECT *
      FROM /fs00/cds0001
      FOR ALL ENTRIES IN @gt_tpm12
      WHERE bukrs EQ @p_bukrs
      AND rfha IN @so_rfha
      AND sgsart EQ '20A'
      AND rfha = @gt_tpm12-deal_number
      INTO TABLE @DATA(lt_data_mm).

    " Class ID Master Data
    SELECT *
      FROM /fs00/cds0004
      INTO CORRESPONDING FIELDS OF TABLE @gt_cds0004
      FOR ALL ENTRIES IN @gt_tpm12
      WHERE ranl EQ @gt_tpm12-security_id.

    " Valuation Cls Desc
    SELECT *
      FROM trgc_val_class_t
      INTO CORRESPONDING FIELDS OF TABLE @gt_val_class_t
      FOR ALL ENTRIES IN @gt_tpm12
      WHERE valuation_area EQ @gt_tpm12-valuation_area
      AND valuation_class EQ @gt_tpm12-valuation_class
      AND spras EQ @sy-langu.
  ENDIF.

  gv_amt_div = COND #( WHEN rb1 EQ abap_true THEN 10000000
                       WHEN rb2 EQ abap_true THEN 100000
                       WHEN rb3 EQ abap_true THEN 1000
                       WHEN rb4 EQ abap_true THEN 1
                       ELSE 1 ).

  " Looping in all data here as field symbol required for each field in dynamic constructed table
  LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<fs_ldata>).
    READ TABLE gt_val_class_t INTO DATA(ls_valcls) WITH KEY valuation_class = <fs_ldata>-valuation_class.
    IF sy-subrc = 0.
      <fs_ldata>-gen_class = |{ CONV i( <fs_ldata>-valuation_class ) } - { ls_valcls-val_class_name }|.
    ENDIF.
    CASE <fs_ldata>-product_type.
      WHEN '20A'.
        READ TABLE lt_data_mm INTO DATA(ls_mm) WITH KEY rfha = <fs_ldata>-deal_number.
        IF sy-subrc = 0.
          <fs_ldata>-start_dt = ls_mm-dblfz.
          <fs_ldata>-bkt_dt = <fs_ldata>-end_dt = ls_mm-delfz.
        ENDIF.
        <fs_ldata>-os_amt = COND #( WHEN <fs_ldata>-market_value IS NOT INITIAL THEN <fs_ldata>-market_value ELSE <fs_ldata>-book_val_pc ).
      WHEN '21A'.
        READ TABLE gt_cds0004 INTO DATA(ls_cds004) WITH KEY <fs_ldata>-security_id.
        IF sy-subrc = 0.
          <fs_ldata> = CORRESPONDING #( BASE ( <fs_ldata> ) ls_cds004 MAPPING product_desc = product_type_desc
                                                                                 name_org1 = issuer_name
                                                                                  xlangbez = xlangbez ).
        ENDIF.
        <fs_ldata>-start_dt = VALUE #( gt_tpm13_purch[ lot_id = <fs_ldata>-lot_id ]-trldate OPTIONAL ).
        <fs_ldata>-end_dt = <fs_ldata>-bkt_dt = gv_nextdate.
        <fs_ldata>-os_amt = COND #( WHEN <fs_ldata>-market_value IS NOT INITIAL THEN <fs_ldata>-market_value ELSE <fs_ldata>-book_val_pc ).
      WHEN '22A' OR '22B'.
        READ TABLE gt_cds0004 INTO DATA(ls_cds0042) WITH KEY <fs_ldata>-security_id.
        IF sy-subrc = 0.
          <fs_ldata>-product_desc = ls_cds0042-product_type_desc.
          <fs_ldata>-name_org1 = ls_cds0042-issuer_name.
          <fs_ldata>-start_dt = ls_cds0042-start_dt .
          <fs_ldata>-bkt_dt = <fs_ldata>-end_dt = ls_cds0042-end_dt .
        ENDIF.
        <fs_ldata>-os_amt = COND #( WHEN <fs_ldata>-market_value IS INITIAL OR <fs_ldata>-valuation_class EQ '0005' THEN <fs_ldata>-book_val_pc ELSE <fs_ldata>-market_value ).
    ENDCASE.
    TRY.
        <fs_ldata>-os_amt = <fs_ldata>-os_amt / gv_amt_div.
      CATCH cx_root.
    ENDTRY.
  ENDLOOP.
  <gt_data>[] = CORRESPONDING #( lt_data ).

  LOOP AT <gt_data> ASSIGNING FIELD-SYMBOL(<fs_data>).
    ASSIGN COMPONENT 'BKT_DT' OF STRUCTURE <fs_data> TO <fs_bkt_dt>.
    ASSIGN COMPONENT 'OS_AMT' OF STRUCTURE <fs_data> TO <fs_os_amt>.

    LOOP AT CAST cl_abap_structdescr( cl_abap_structdescr=>describe_by_data( <fs_data> ) )->get_components( ) REFERENCE INTO DATA(rf_component) WHERE name CP 'B_*'.
      ASSIGN COMPONENT rf_component->name OF STRUCTURE <fs_data> TO <fs_bucket_field>.
      CHECK <fs_bucket_field> IS ASSIGNED.
      SPLIT rf_component->name AT '_' INTO DATA(_) DATA(bkt_id).
      READ TABLE gt_buck REFERENCE INTO DATA(rf_buck) WITH KEY zbuc = bkt_id.
      IF sy-subrc EQ 0 AND rf_buck IS BOUND.
        " Assigning OS amt to respective bucket based on dates calculated using /FS00/ALMFM001
        IF <fs_bkt_dt> GE rf_buck->zf_date AND <fs_bkt_dt> LE rf_buck->zt_date.
          <fs_bucket_field> = <fs_bucket_field> + <fs_os_amt>.
        ENDIF.
        FREE: rf_buck.
      ENDIF.
      UNASSIGN: <fs_bucket_field>.
    ENDLOOP.
  ENDLOOP.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form display
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM display .
  gt_fcat = VALUE #(
*  fix_column = abap_true
      ( fieldname = 'COMPANY_CODE' scrtext_l = 'Company Code' )
      ( fieldname = 'PRODUCT_TYPE' scrtext_l = 'Product Type' )
      ( fieldname = 'PRODUCT_DESC' scrtext_l = 'Product Type Desc' )
      ( fieldname = 'GEN_CLASS'    scrtext_l = 'Gen Val Class' )
      ( fieldname = 'SECURITY_ID'  scrtext_l = 'Class ID'           emphasize = 'C400'    edit_mask  = '==ALPHA' )
      ( fieldname = 'DEAL_NUMBER'  scrtext_l = 'Transaction Number' emphasize = 'C400'    edit_mask  = '==ALPHA' )
      ( fieldname = 'NAME_ORG1'    scrtext_l = 'Business Partner' )
      ( fieldname = 'START_DT'     scrtext_l = 'Start Date' )
      ( fieldname = 'END_DT'       scrtext_l = 'End Date' )
      ( fieldname = 'BKT_DT '      scrtext_l = 'Bucket Date' )
      ( fieldname = 'OS_AMT'       scrtext_l = 'Outstanding Amount' no_zero   = abap_true decimals_o = '2' )
      ( fieldname = 'XLANGBEZ'     scrtext_l = 'Gen Sec Classification' )
  ).
  CREATE DATA rf_data LIKE LINE OF <gt_data>[].
  LOOP AT CAST cl_abap_structdescr( cl_abap_structdescr=>describe_by_data_ref( rf_data ) )->get_components( ) REFERENCE INTO DATA(rf_component) WHERE name CP 'B_*'.
    SPLIT rf_component->name AT '_' INTO DATA(_) DATA(bkt_id).
    READ TABLE gt_tr005 REFERENCE INTO DATA(rf_buck_desc) WITH KEY zbuc = bkt_id.
    IF sy-subrc = 0 AND rf_buck_desc IS BOUND.
      APPEND VALUE lvc_s_fcat( fieldname  = rf_component->name
                               scrtext_l  = rf_buck_desc->zdesc
                               no_zero    = abap_true
                               decimals_o = '2' ) TO gt_fcat.
    ENDIF.
  ENDLOOP.

  gs_layout-cwidth_opt = abap_true.
  gs_layout-zebra = abap_true.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
    EXPORTING
      i_callback_program     = sy-cprog
*     i_callback_user_command  = 'USR_CMD'
      i_callback_top_of_page = 'TOP_PAGE'
      i_html_height_top      = 22
      is_layout_lvc          = gs_layout
      it_fieldcat_lvc        = gt_fcat
      i_default              = abap_true
      i_save                 = 'A'
      is_variant             = gs_variant
    TABLES
      t_outtab               = <gt_data>[]
    EXCEPTIONS
      program_error          = 1
      OTHERS                 = 2.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form sub_get_layout
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM sub_get_layout .
  gs_variant-report   = sy-repid.
  CALL FUNCTION 'REUSE_ALV_VARIANT_F4'
    EXPORTING
      is_variant    = gs_variant
    IMPORTING
      es_variant    = gs_variant
    EXCEPTIONS
      not_found     = 1
      program_error = 2
      OTHERS        = 3.
  IF sy-subrc = 0.
    p_layout = gs_variant-variant.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*&      Form  TOP_PAGE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM top_page .
  DATA :lv_butxt  TYPE butxt.
  SELECT SINGLE butxt FROM t001 INTO @lv_butxt WHERE bukrs = @p_bukrs.
  DATA(lt_header) = VALUE slis_t_listheader(
    ( typ = 'H' info = 'Principal OS (SLS)' )
    ( typ = 'S' key  = 'Company:' info = |{ lv_butxt }| )
    ( typ = 'S' key  = 'Month:'   info = |{ p_month }| )
    ( typ = 'S' key  = 'Year:'    info = |{ p_year }| )
  ).
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_header[].
ENDFORM.                    " top_page
*&---------------------------------------------------------------------*
*& Form construct_buckets
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM construct_buckets.
  DATA: lo_tabletype  TYPE REF TO cl_abap_tabledescr,
        lt_components TYPE abap_component_tab.
  p_month = |{ p_month ALPHA = IN }|.
  gv_lastdaym = |{ p_year }{ p_month }01| .

  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = gv_lastdaym
    IMPORTING
      last_day_of_month = gv_lastdaym
    EXCEPTIONS
      day_in_no_date    = 1
      OTHERS            = 2.
  gv_nextdate = gv_lastdaym + 1.

  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '02'
      im_date = gv_nextdate
    IMPORTING
      ex_buck = gt_buck.

  SELECT *
    FROM /fs00/almtr005
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr005.

  FREE: rft_data.
  UNASSIGN: <gt_data>.
  TRY.
      lo_tabletype = cl_abap_tabledescr=>create(
         p_line_type = cl_abap_structdescr=>create(
           p_components = VALUE abap_component_tab( BASE CAST cl_abap_structdescr( cl_abap_structdescr=>describe_by_name( 'TY_DATA' ) )->get_components( )
             FOR <bucket> IN gt_buck
            ( name = |B_{ <bucket>-zbuc }| type = CAST cl_abap_datadescr( cl_abap_typedescr=>describe_by_name( 'TPM_AMOUNT' ) ) )
            ) ) ).
      TRY.
          CREATE DATA rft_data TYPE HANDLE lo_tabletype.
          IF rft_data IS BOUND.
            ASSIGN rft_data->* TO <gt_data>.
          ENDIF.
        CATCH cx_sy_create_data_error.
      ENDTRY.
    CATCH: cx_sy_table_creation, cx_sy_struct_creation.
  ENDTRY.
ENDFORM.