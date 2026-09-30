*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR021_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .
  DATA: lr_bukrs    TYPE RANGE OF bukrs,
        lr_varea    TYPE RANGE OF tpm_val_area,
        lr_flow     TYPE RANGE OF zdt_flow_cat,
        lv_date     TYPE dats,
        lr_os_flows TYPE RANGE OF zdt_flow_cat,
        lr_log_flow TYPE RANGE OF tpm_dis_flowtype.
  lr_os_flows = VALUE #( sign = 'I' option = 'EQ' ( low = 'FL31' )
                                                  ( low = 'FL51' )
                                                  ( low = 'FL52' ) ).
  IF rb_cp EQ abap_true.
    gr_prd = VALUE #( sign = 'I' option = 'EQ' ( low = '15A' ) ).
  ELSEIF rb_ncd EQ abap_true.
    gr_prd = VALUE #( sign = 'I' option = 'EQ' ( low = '15D' ) ).
    lr_flow = VALUE #( sign = 'I' option = 'EQ' ( low = 'FL04' )
                                                ( low = 'FL36' ) ).
  ENDIF.

  gv_month_st = lv_date = |{ p_year }{ p_month }01|.
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = lv_date
    IMPORTING
      last_day_of_month = lv_date.

  gv_month_end = lv_date.
  lv_date = lv_date + 1.

  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '02'
      im_date = lv_date
    IMPORTING
      ex_buck = gt_buck.

  " Class ID Master Data
  IF rb_cp EQ abap_true.
    SELECT a~product_type AS gsart,
           a~product_type_desc,
           a~ranl,
           a~ranl_ln,
           a~isin,
           b~zbp_inv AS investor,
           b~zrecdate AS recdate,
           c~name_org1,
           d~grp AS grp_key,
           e~zsegment AS segment
      FROM /fs00/cds0004 AS a
      LEFT OUTER JOIN ztrm_t0008 AS b ON b~zisin EQ a~isin
      LEFT OUTER JOIN but000 AS c ON c~partner EQ b~zbp_inv
      LEFT OUTER JOIN bp3010 AS d ON d~partner EQ b~zbp_inv AND d~grp_typ EQ '801'
      LEFT OUTER JOIN /fs00/almtr029 AS e ON e~zbp_grp EQ d~grp
      WHERE a~product_type IN @gr_prd
      AND a~ranl IN @so_ranl
      AND b~zrecdate LE @gv_month_end
      INTO CORRESPONDING FIELDS OF TABLE @gt_data.
  ELSEIF rb_ncd EQ abap_true.
    SELECT a~product_type AS gsart,
           a~product_type_desc,
           a~ranl,
           a~ranl_ln,
           a~isin,
           b~zbp_inv AS investor,
           b~zrecdate AS recdate,
           CAST( b~zposition AS DEC( 16, 3 ) ) AS units,
           b~zfacevalue AS face_value,
           c~name_org1,
           d~grp AS grp_key,
           e~zsegment AS segment
      FROM /fs00/cds0004 AS a
      LEFT OUTER JOIN ztrm_t0009 AS b ON b~zisin EQ a~isin
      LEFT OUTER JOIN but000 AS c ON c~partner EQ b~zbp_inv
      LEFT OUTER JOIN bp3010 AS d ON d~partner EQ b~zbp_inv AND d~grp_typ EQ '801'
      LEFT OUTER JOIN /fs00/almtr029 AS e ON e~zbp_grp EQ d~grp
      WHERE a~product_type IN @gr_prd
      AND a~ranl IN @so_ranl
      AND b~zrecdate LE @gv_month_end
      INTO CORRESPONDING FIELDS OF TABLE @gt_data.
  ENDIF.

  SORT gt_data BY ranl ASCENDING investor ASCENDING recdate DESCENDING.
  DELETE ADJACENT DUPLICATES FROM gt_data COMPARING ranl investor.

  IF so_ranl IS INITIAL.
    gr_ranl = VALUE #( FOR ls IN gt_data ( sign = 'I' option = 'EQ' low = ls-ranl ) ).
  ELSE.
    gr_ranl[] = so_ranl[].
    DELETE gt_data WHERE ranl NOT IN gr_ranl.
  ENDIF.

  " Get Outstanding Position Data
  IF rb_cp EQ abap_true.
    lr_bukrs = VALUE #( ( sign = 'I' option = 'EQ' low = p_bukrs ) ).
    lr_varea = VALUE #( ( sign = 'I' option = 'EQ' low = '001' ) ).
    SUBMIT rtpm_trl_show_position_values WITH p_sec    EQ abap_true
                                         WITH p_dea    EQ abap_true
                                         WITH pm_date  EQ gv_month_end
                                         WITH so_bukrs IN lr_bukrs
                                         WITH so_varea IN lr_varea
                                         WITH so_pt    IN gr_prd
                                         WITH so_ranl  IN gr_ranl
                                         EXPORTING LIST TO MEMORY AND RETURN.
    IMPORT g_tab_position_value_attr_txt = gt_tpm12 FROM MEMORY ID 'G_TAB_POSITION_VALUE_ATTR_TXT'.
    FREE MEMORY ID 'G_TAB_POSITION_VALUE_ATTR_TXT'.
    SORT gt_tpm12 BY product_type security_id.
  ELSEIF rb_ncd EQ abap_true.
    " CF Data
    SELECT  a~os_guid,
            a~bustranscat,
            a~trldate,
            a~bustransid,
            a~booking_state,
            a~flowtype,
            a~dis_flowtypetext,
            a~zfs_flow,
            a~units,
            a~nominal_amt,
            a~nominal_curr,
            a~position_amt,
            a~position_curr,
            a~valuation_amt,
            a~valuation_curr,
            a~valuation_area,
            a~valuation_class,
            a~company_code,
            a~product_type,
            a~security_id,
            a~deal_number,
            a~fi_post_date,
            a~portfolio
      FROM /fs00/cds0002 AS a
      WHERE a~company_code EQ @p_bukrs
      AND a~product_type IN @gr_prd
      AND a~security_id IN @gr_ranl
*      AND valuation_area EQ '002'
      INTO CORRESPONDING FIELDS OF TABLE @gt_cf.
    DELETE gt_cf WHERE booking_state = 4.
    SORT gt_cf BY company_code deal_number security_id valuation_area zfs_flow trldate.
    PERFORM get_amort_logs.
  ENDIF.

  SELECT *
    FROM /fs00/almtr008
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr008.

  gv_amt_div = COND #( WHEN rb1 EQ abap_true THEN 10000000
                       WHEN rb2 EQ abap_true THEN 100000
                       WHEN rb3 EQ abap_true THEN 1000
                       WHEN rb4 EQ abap_true THEN 1
                       ELSE 1 ).

  LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_data>).
    <fs_data>-alm_segment = |{ <fs_data>-grp_key }-{ <fs_data>-segment }|.
    IF rb_cp EQ abap_true.
      READ TABLE gt_tr008 INTO DATA(ls_tr008) WITH KEY zexl_src = <fs_data>-alm_segment zgrp_cd = 'A4'.
      IF sy-subrc = 0.
        <fs_data>-source = ls_tr008-zsrc.
        <fs_data>-src_desc = ls_tr008-zsrc_desc.
      ENDIF.
      READ TABLE gt_tpm12 INTO DATA(ls_tpm12) WITH KEY security_id = <fs_data>-ranl.
      IF sy-subrc = 0.
        <fs_data>-units = ls_tpm12-units.
        TRY.
            <fs_data>-os_amt = abs( ls_tpm12-amaqu_val_pc ).
          CATCH cx_root.
        ENDTRY.
        <fs_data>-bkt_dt = ls_tpm12-mat_term_end.
        <fs_data>-days = ls_tpm12-mat_term_end - gv_month_end.
      ENDIF.
    ELSEIF rb_ncd EQ abap_true.
      READ TABLE gt_tr008 INTO ls_tr008 WITH KEY zexl_src = <fs_data>-alm_segment zgrp_cd = 'A3'.
      IF sy-subrc = 0.
        <fs_data>-source = ls_tr008-zsrc.
        <fs_data>-src_desc = ls_tr008-zsrc_desc.
      ENDIF.
      TRY.
          <fs_data>-share = <fs_data>-face_value * <fs_data>-units.
          <fs_data>-total_issue_size = REDUCE tpm_amount( INIT amt = CONV tpm_amount( 0 ) FOR <cf> IN gt_cf
                                                            WHERE ( security_id = <fs_data>-ranl AND zfs_flow IN lr_flow AND valuation_area = '002' )
                                                              NEXT amt = amt + <cf>-position_amt ).
          <fs_data>-os_perc = <fs_data>-share / <fs_data>-total_issue_size.
        CATCH cx_root.
      ENDTRY.

      READ TABLE gt_cf INTO DATA(ls_cf) WITH KEY security_id = <fs_data>-ranl zfs_flow = 'FL36'.
      IF sy-subrc = 0.
        PERFORM premium_amort CHANGING <fs_data>.
      ENDIF.
      <fs_data>-portfolio = VALUE #( gt_cf[ security_id = <fs_data>-ranl zfs_flow = 'FL01' ]-portfolio OPTIONAL ).
      <fs_data>-bkt_dt = VALUE #( gt_cf[ security_id = <fs_data>-ranl zfs_flow = 'FL04' ]-trldate OPTIONAL ).
      <fs_data>-days =  <fs_data>-bkt_dt - gv_month_end.
      <fs_data>-os_amt_total = <fs_data>-os_amt_total + VALUE tpm_amount( gt_cf[ security_id = <fs_data>-ranl zfs_flow = 'FL04' ]-position_amt OPTIONAL ).

      TRY.
          <fs_data>-os_amt_total = ( <fs_data>-os_amt_total - REDUCE tpm_amount( INIT os = 0 FOR <cf> IN gt_cf
                                        WHERE ( security_id = <fs_data>-ranl AND trldate LE gv_month_end AND zfs_flow IN lr_os_flows )
                                        NEXT os = os + COND tpm_amount(
                                                          WHEN <cf>-zfs_flow = 'FL31' AND <cf>-valuation_area = '001' THEN <cf>-position_amt
                                                          WHEN <cf>-zfs_flow = 'FL51' AND <cf>-valuation_area = '001' THEN <cf>-position_amt
                                                          WHEN <cf>-zfs_flow = 'FL52' AND <cf>-valuation_area = '001' THEN <cf>-position_amt * -1
                                                          WHEN <cf>-zfs_flow = 'FL51' AND <cf>-valuation_area = '002' THEN <cf>-position_amt * -1
                                                          WHEN <cf>-zfs_flow = 'FL52' AND <cf>-valuation_area = '002' THEN <cf>-position_amt
                                                          ELSE 0 ) ) ).
        CATCH cx_root.
      ENDTRY.
      <fs_data>-os_amt = <fs_data>-os_amt_total * <fs_data>-os_perc.
    ENDIF.
    TRY.
        <fs_data>-os_amt = <fs_data>-os_amt / gv_amt_div.
      CATCH cx_root.
    ENDTRY.
    LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE ( zf_days <= <fs_data>-days AND zt_days >= <fs_data>-days ).
      <fs_data>-bkt_no = <fs_buck>-zbuc.
      EXIT.
    ENDLOOP.
  ENDLOOP.
  IF p_src IS NOT INITIAL.
    DELETE gt_data WHERE source NE p_src.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form display
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM display .
  gt_fcat = VALUE #(
       ( fieldname = 'GSART'             scrtext_l = 'Product Type' )
       ( fieldname = 'PRODUCT_TYPE_DESC' scrtext_l = 'Product Type Desc' )
       ( fieldname = 'RANL'              scrtext_l = 'Class ID'                      emphasize = 'C400'    hotspot    = abap_true edit_mask = '==ALPHA' )
       ( fieldname = 'RANL_LN'           scrtext_l = 'Class ID Desc.'                outputlen = 60 )
       ( fieldname = 'ISIN'              scrtext_l = 'ISIN'                          outputlen = 15 )
       ( fieldname = 'INVESTOR'          scrtext_l = 'Investor ID'                   edit_mask = '==ALPHA' )
       ( fieldname = 'NAME_ORG1'         scrtext_l = 'Investor Name'                 outputlen = 40 )
       ( fieldname = 'UNITS'             scrtext_l = 'Units'                         no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'BKT_DT'            scrtext_l = 'Bucket Date' )
       ( fieldname = 'BKT_NO'            scrtext_l = 'Bucket Number' )
       ( fieldname = 'OS_AMT'            scrtext_l = 'Outstanding Amount'            no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'ALM_SEGMENT'       scrtext_l = 'Segment' )
       ( fieldname = 'SOURCE'            scrtext_l = 'Source' )
       ( fieldname = 'SRC_DESC'          scrtext_l = 'Source Description' )
       ( fieldname = 'FACE_VALUE'        scrtext_l = 'Face Value'                    no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'SHARE'             scrtext_l = 'Share'                         no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'TOTAL_ISSUE_SIZE'  scrtext_l = 'Total Issue Size'              no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'OS_PERC'           scrtext_l = '% of Outstanding'              no_zero   = abap_true decimals_o = '2' )
       ( fieldname = 'AMORT_ISSUE'       scrtext_l = 'Amortization of Issue Premium' no_zero   = abap_true decimals_o = '2' )
  ).
  gs_layout-cwidth_opt = abap_true.
  gs_layout-zebra = abap_true.
  gs_variant-handle = COND #( WHEN rb_cp EQ abap_true THEN '1'
                               WHEN rb_ncd EQ abap_true THEN '2' ).
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
    EXPORTING
      i_callback_program      = sy-cprog
      i_callback_user_command = 'USR_CMD'
      i_callback_top_of_page  = 'TOP_PAGE'
      i_html_height_top       = 22
      is_layout_lvc           = gs_layout
      it_fieldcat_lvc         = gt_fcat
      i_default               = abap_true
      i_save                  = 'A'
      is_variant              = gs_variant
    TABLES
      t_outtab                = gt_data
    EXCEPTIONS
      program_error           = 1
      OTHERS                  = 2.
ENDFORM.
*&---------------------------------------------------------------------*
*&      Form  TOP_PAGE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM top_page .
  SELECT SINGLE butxt FROM t001 INTO @DATA(lv_butxt) WHERE bukrs EQ @p_bukrs.
  SELECT SINGLE ltx FROM t247 INTO @DATA(lv_montxt) WHERE mnr EQ @p_month AND spras EQ @sy-langu.
  DATA(lt_header) = VALUE slis_t_listheader(
    ( typ = 'H' info = 'Drilldown for CP & NCD Investors' )
    ( typ = 'S' key  = 'Company:'  info = |{ lv_butxt }| )
    ( typ = 'S' key  = 'Month:'    info = |{ lv_montxt }| )
    ( typ = 'S' key  = 'Year:'     info = |{ p_year }| )
  ).
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_header[].
ENDFORM.                    " top_page
*&---------------------------------------------------------------------*
*&      Form  USR_CMD
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM usr_cmd USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CLEAR: gs_data.
  READ TABLE gt_data ASSIGNING FIELD-SYMBOL(<fs_data>) INDEX rs_selfield-tabindex.
  IF sy-subrc = 0.
    CASE r_ucomm.
      WHEN '&IC1'.
        CASE rs_selfield-fieldname.
          WHEN 'RANL'.
            CALL FUNCTION '/FS00/ALMFM002'
              EXPORTING
                iv_bukrs = p_bukrs
                iv_ranl  = <fs_data>-ranl.
        ENDCASE.
    ENDCASE.
  ENDIF.
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
*& Form HIDE_FIELDS
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM hide_fields .
  DATA: lr_screen TYPE RANGE OF char100.
  lr_screen = VALUE #( sign = 'I' option = 'EQ' ( low = '%_P_SRC_%_APP_%-TEXT' )
                                                ( low = 'P_SRC' ) ).
  LOOP AT SCREEN.
    IF screen-name IN lr_screen.
      screen-active = 0.
      screen-invisible = abap_true.
      MODIFY SCREEN.
    ENDIF.
  ENDLOOP.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_amort_logs
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_amort_logs .
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fspl/trm_r0214 WITH p_bukrs EQ p_bukrs
                         WITH p_month EQ p_month
                         WITH p_year EQ p_year
                         WITH so_ranl IN gr_ranl
                         EXPORTING LIST TO MEMORY AND RETURN.
  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      IF <fs_dat> IS ASSIGNED.
        MOVE-CORRESPONDING <fs_dat> TO gt_r0214.
      ENDIF.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_true
                                          metadata = abap_true
                                          data     = abap_true ).
ENDFORM.
*&---------------------------------------------------------------------*
*& Form premium_amort
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM premium_amort CHANGING p_data TYPE ty_data.
  DATA: lr_amort002_flows TYPE RANGE OF zdt_flow_cat,
        lr_log_flow       TYPE RANGE OF tpm_dis_flowtype.
  lr_amort002_flows = VALUE #( sign = 'I' option = 'EQ' ( low = 'FL51' )
                                                        ( low = 'FL52' )
                                                        ( low = 'FL11' ) ).
  lr_log_flow = VALUE #( sign = 'I' option = 'EQ' ( low = 'SE1200' )
                                                  ( low = '      ' ) ).
  p_data-premium_to_be_amortized = REDUCE tpm_amount( INIT premium = 0 FOR <cf> IN gt_cf
                                    WHERE ( security_id = p_data-ranl AND valuation_area = '002' AND flowtype = 'DBT_A053' )
                                    NEXT premium = premium + <cf>-position_amt ).
  p_data-amort002 = REDUCE tpm_amount( INIT amort = 0 FOR <cf> IN gt_cf
                                    WHERE ( security_id = p_data-ranl AND trldate LE gv_month_end AND valuation_area = '002' AND zfs_flow IN lr_amort002_flows )
                                    NEXT amort = amort + COND tpm_amount(
                                                      WHEN <cf>-zfs_flow = 'FL51' THEN <cf>-position_amt * -1
                                                      WHEN <cf>-zfs_flow = 'FL52' THEN <cf>-position_amt
                                                      ELSE 0 ) ).
  TRY.
      p_data-os_amt_total = p_data-amort_issue = p_data-premium_to_be_amortized - ( ( REDUCE #( INIT rel TYPE tpm_amount FOR <r0214> IN gt_r0214
                                           WHERE ( ranl EQ p_data-ranl AND calc_frm LE gv_month_end )
                                           NEXT rel = rel + <r0214>-rev_amt ) )
                          - ( REDUCE #( INIT amt TYPE tpm_amount FOR <r0214> IN gt_r0214 WHERE ( ranl EQ p_data-ranl AND calc_frm LE gv_month_end
                                           AND ( update_type IN lr_log_flow OR update_type IS INITIAL ) )
                                           NEXT amt = amt + <r0214>-amt ) )
                          -  p_data-amort002 ).
    CATCH cx_root.
  ENDTRY.

ENDFORM.