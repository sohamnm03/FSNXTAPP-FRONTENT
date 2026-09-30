*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR010_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*&      Form  get_data
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM get_data .

  IF rb1 IS NOT INITIAL .
    gv_div =  10000000.
  ELSEIF rb2 IS NOT INITIAL.
    gv_div =  100000 .
  ELSEIF rb3 IS NOT INITIAL.
    gv_div =  1000.
  ENDIF.

  " Get G/L Data
  IF p_as EQ abap_true.
    " Mapped GL Data
    SELECT a~bukrs,
           a~saknr     AS gl_acc,
           b~ktopl     AS chrt_acc,
           c~xbilk,
           d~zcal      AS cal_typ,
           d~zcal_desc AS cal_desc,
           d~zgr_id    AS gr_id,
           d~zbu_id    AS bu_id,
           d~zbu_desc  AS bu_desc,
           d~ztype3    AS type,
           d~zgrp_id   AS gr_id2,
           e~zgrp_name AS gr_desc,
           f~zgrp_name AS gr_desc2,
           g~txt20     AS short_text,
           g~txt50     AS long_text
      INTO CORRESPONDING FIELDS OF TABLE @gt_data
      FROM skb1 AS a
      INNER JOIN t001 AS b
      ON b~bukrs EQ a~bukrs
      INNER JOIN ska1 AS c
      ON c~saknr EQ a~saknr AND c~ktopl EQ b~ktopl
      INNER JOIN /fs00/almtr018 AS d
      ON d~zgl_id EQ a~saknr ""AND zgr_id = @p_grp
      LEFT OUTER JOIN /fs00/almtr002 AS e
      ON e~zgrp_id EQ d~zgr_id
      LEFT OUTER JOIN /fs00/almtr003 AS f
      ON f~zgrp_id EQ d~zgrp_id
      LEFT OUTER JOIN skat AS g
      ON g~saknr EQ c~saknr AND g~ktopl EQ c~ktopl AND g~spras EQ @sy-langu
      WHERE a~bukrs EQ @p_bukrs.
    IF p_grp IS NOT INITIAL.
      DELETE gt_data WHERE gr_id <> p_grp.
    ENDIF.

    IF p_grp2 IS NOT INITIAL.
      DELETE gt_data WHERE gr_id2 <> p_grp2.
    ENDIF.

  ELSE.
    " All GLs
    SELECT  a~bukrs,
            a~saknr AS gl_acc,
            b~ktopl AS chrt_acc,
            c~xbilk,
            d~txt20 AS short_text,
            d~txt50 AS long_text
      INTO CORRESPONDING FIELDS OF TABLE @gt_data
      FROM skb1 AS a
      INNER JOIN t001 AS b ON b~bukrs EQ a~bukrs
      INNER JOIN ska1 AS c ON c~saknr EQ a~saknr AND c~ktopl EQ b~ktopl
      LEFT OUTER JOIN skat AS d ON d~saknr EQ c~saknr AND d~ktopl EQ c~ktopl AND d~spras EQ @sy-langu
      WHERE a~bukrs EQ @p_bukrs.
    " ALM2 Mapped Data
    SELECT a~zgl_id,
           a~zgl_desc,
           a~zgr_id,
           a~zcal,
           a~zcal_desc,
           a~zbu_id,
           a~zbu_desc,
           a~ztype3,
           a~zsns,
           a~zgrp_id,
*         a~zgrp_name,
           b~zgrp_name AS zgr_desc,
           c~zgrp_name AS zgrp_name
      INTO CORRESPONDING FIELDS OF TABLE @gt_tr018
      FROM /fs00/almtr018 AS a
      LEFT OUTER JOIN /fs00/almtr002 AS b ON b~zgrp_id EQ a~zgr_id
      LEFT OUTER JOIN /fs00/almtr003 AS c
            ON c~zgrp_id EQ a~zgrp_id.
  ENDIF.
  " Get G/L Acct Balances
  PERFORM get_gl_balances.

  LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_data>).
    IF p_as EQ abap_false.
      " Check ALM2 GL Account Mapping
      READ TABLE gt_tr018 INTO gs_tr018 WITH KEY zgl_id = <fs_data>-gl_acc.
      IF sy-subrc = 0.
        <fs_data> = CORRESPONDING #( BASE ( <fs_data> ) gs_tr018 MAPPING cal_typ  = zcal
                                                                         cal_desc = zcal_desc
                                                                         gr_id    = zgr_id
                                                                         gr_desc  = zgr_desc
                                                                         bu_id    = zbu_id
                                                                         bu_desc  = zbu_desc
                                                                         type     = ztype3
                                                                         gr_id2   = zgrp_id
                                                                         gr_desc2 = zgrp_name ).
        <fs_data>-alm_map = c_yes.
        <fs_data>-color = VALUE lvc_t_scol(
                           ( fname = 'ALM_MAP'
                             color = VALUE lvc_s_colo( col = 5 ) ) ).    " Green
      ELSE.
        <fs_data>-alm_map = c_no.
        <fs_data>-color = VALUE lvc_t_scol(
                           ( fname = 'ALM_MAP'
                             color = VALUE lvc_s_colo( col = 6 ) ) ).     " Red
      ENDIF.
    ELSE.
      <fs_data>-alm_map = c_yes.
      <fs_data>-color = VALUE lvc_t_scol(
                         ( fname = 'ALM_MAP'
                           color = VALUE lvc_s_colo( col = 5 ) ) ).    " Green
    ENDIF.
    <fs_data>-bs_acc = COND #( WHEN <fs_data>-xbilk EQ abap_true THEN c_yes ELSE c_no ).
    " Map GL Balances
    READ TABLE gt_gl INTO DATA(ls_gl) WITH KEY bukrs = <fs_data>-bukrs saknr = <fs_data>-gl_acc BINARY SEARCH.
    IF sy-subrc = 0.
      <fs_data>-bal = ls_gl-acytd_bal.
      <fs_data>-ab_bal = abs( ls_gl-acytd_bal ).
    ENDIF.

    IF gv_div IS NOT INITIAL.
      <fs_data>-bal =  <fs_data>-bal / gv_div.
      <fs_data>-ab_bal =  <fs_data>-ab_bal / gv_div.
    ENDIF.

  ENDLOOP.

  "" filtering based on the selection screen parameter
  PERFORM filtering.
ENDFORM.                    " get_data
*&---------------------------------------------------------------------*
*&      Form  DISPLAY
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM display .
  gt_fcat = VALUE #(
    ( fieldname = 'BUKRS'      scrtext_l = 'Co Code' )
    ( fieldname = 'CHRT_ACC'   scrtext_l = 'Chart of Accnts' )
    ( fieldname = 'BS_ACC'     scrtext_l = 'B/S Acct' )
    ( fieldname = 'GL_ACC'     scrtext_l = 'G/L Acct'               emphasize = abap_true edit_mask = '==ALPHA' )
    ( fieldname = 'SHORT_TEXT' scrtext_l = 'G/L Acct Short text' )
    ( fieldname = 'LONG_TEXT'  scrtext_l = 'G/L Acct Long text' )
    ( fieldname = 'BAL'        scrtext_l = 'Balance'                no_zero   = abap_true )
    ( fieldname = 'AB_BAL'     scrtext_l = 'Absolute Balance'       no_zero   = abap_true )
    ( fieldname = 'GR_ID'      scrtext_l = 'ALM2 Group Code' )
    ( fieldname = 'GR_DESC'    scrtext_l = 'ALM2 Group Description' outputlen = 40 )
    ( fieldname = 'CAL_TYP'    scrtext_l = 'Source' )
    ( fieldname = 'CAL_DESC'   scrtext_l = 'Source Description' )
    ( fieldname = 'BU_ID'      scrtext_l = 'Bucket'                 no_zero   = abap_true )
    ( fieldname = 'BU_DESC'    scrtext_l = 'Bucket Description' )
    ( fieldname = 'TYPE'       scrtext_l = 'TYPE' )
    ( fieldname = 'GR_ID2'     scrtext_l = 'ALM3 Group Code' )
    ( fieldname = 'GR_DESC2'   scrtext_l = 'ALM3 Group Description' outputlen = 40 )
    ( fieldname = 'ALM_MAP'    scrtext_l = 'ALM Mapping' )
  ).
  gs_layout-cwidth_opt = abap_true.
  gs_layout-ctab_fname = 'COLOR'.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
    EXPORTING
      i_callback_program     = sy-cprog
*     i_callback_user_command  = 'USR_CMD'
      i_callback_top_of_page = 'TOP_PAGE'
      i_html_height_top      = 19
      is_layout_lvc          = gs_layout
      it_fieldcat_lvc        = gt_fcat
      i_default              = abap_true
      i_save                 = 'A'
      is_variant             = gs_variant
    TABLES
      t_outtab               = gt_data
    EXCEPTIONS
      program_error          = 1
      OTHERS                 = 2.
ENDFORM.                    " DISPLAY
*&---------------------------------------------------------------------*
*&      Form  TOP_PAGE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM top_page .
  DATA :lv_butxt  TYPE butxt.
  SELECT SINGLE butxt FROM t001 INTO @lv_butxt WHERE bukrs = @p_bukrs.
  gt_header = VALUE slis_t_listheader(
    ( typ = 'H' info = 'Check GL Account Mapping' )
    ( typ = 'S' key  = 'Company:' info = |{ lv_butxt }| )
    ( typ = 'S' key  = 'Month:'   info = |{ p_month }| )
    ( typ = 'S' key  = 'Year:'    info = |{ p_year }| )
  ).
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = gt_header[].
ENDFORM.                    " top_page
*&---------------------------------------------------------------------*
*&      Form  SUB_GET_LAYOUT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
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
ENDFORM.                    " SUB_GET_LAYOUT
*&---------------------------------------------------------------------*
*& Form filtering
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM filtering .
  IF p_check = abap_false.
    DELETE gt_data WHERE bal = '0'.
  ENDIF.
  IF p_bs = abap_true.
    DELETE gt_data WHERE bs_acc = c_no.
  ENDIF.
  IF s_cal IS NOT INITIAL.
    DELETE gt_data WHERE cal_typ NOT IN s_cal.
  ENDIF.
  IF p_grp IS NOT INITIAL.
    DELETE gt_data WHERE gr_id <> p_grp.
  ENDIF.
  IF p_grp2 IS NOT INITIAL.
    DELETE gt_data WHERE gr_id2 <> p_grp2.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_gl_balances
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_gl_balances .
  DATA: lr_gl     TYPE RANGE OF hkont,
        lr_bukrs  TYPE RANGE OF bukrs,
        lr_year   TYPE RANGE OF gjahr,
        lr_period TYPE RANGE OF allgbmon,
        f_year    TYPE n LENGTH 4,
        f_month   TYPE n LENGTH 2,
        lv_sdate  TYPE dats.
  " Get Fiscal Month and Year for G/L Acct Balances
  lv_sdate = |{ p_year }{ p_month }01|.
  CALL FUNCTION 'FTI_FISCAL_YEAR_MONTH_GET'
    EXPORTING
      i_bukrs = p_bukrs
      i_budat = lv_sdate
    IMPORTING
      e_gjahr = f_year
      e_monat = f_month.
  lr_bukrs  = VALUE #( sign = 'I' option = 'EQ' ( low = p_bukrs ) ).
  lr_year = VALUE #( sign = 'I' option = 'EQ' ( low = f_year ) ).
  lr_period = VALUE #( sign = 'I' option = 'BT' ( low = f_month high = f_month ) ).
  lr_gl = VALUE #( FOR ls IN gt_data ( sign = 'I' option = 'EQ' low = ls-gl_acc ) ) .
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT rfssld00 WITH sd_bukrs IN lr_bukrs
                   WITH sd_gjahr IN lr_year
                   WITH sd_saknr IN lr_gl
                   WITH b_monate IN lr_period
                   WITH par_lis1 = abap_true
                   WITH par_lis2 = abap_true
                   EXPORTING LIST TO MEMORY AND RETURN.
  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_gld ).
      IF gt_gld IS NOT INITIAL.
        ASSIGN gt_gld->* TO <fs_dat>.
        MOVE-CORRESPONDING <fs_dat> TO gt_gl.
      ELSE.
        MESSAGE TEXT-008 TYPE 'S' DISPLAY LIKE 'E'.
        LEAVE LIST-PROCESSING.
      ENDIF.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.
  cl_salv_bs_runtime_info=>clear_all( ).
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_true
                                          metadata = abap_true
                                          data     = abap_true ).
  SORT gt_gl BY bukrs saknr ASCENDING.
ENDFORM.
