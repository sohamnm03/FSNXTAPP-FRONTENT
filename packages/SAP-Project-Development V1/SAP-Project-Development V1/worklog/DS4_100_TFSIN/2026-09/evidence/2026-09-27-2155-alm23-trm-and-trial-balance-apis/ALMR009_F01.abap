*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR009_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .

  SELECT a~bukrs,
         a~saknr AS gl_acc,
         a~erdat AS created_date,
         a~ernam AS created_by,
         a~xspeb AS skb1_xspeb,
         b~ktopl AS chrt_acc,
         b~xbilk,
         b~xspeb AS ska1_xspeb,
         b~xspea,
         b~xloev,
         c~txt20 AS short_text,
         c~txt50 AS long_text
    FROM skb1 AS a
    INNER JOIN ska1 AS b ON b~saknr EQ a~saknr
    INNER JOIN skat AS c ON c~saknr EQ b~saknr AND c~ktopl EQ b~ktopl AND c~spras EQ @sy-langu
    WHERE a~bukrs EQ @p_bukrs
      AND a~erdat IN @so_date
      AND b~ktopl EQ @p_chart
      AND ( @p_bs IS INITIAL OR b~xbilk EQ @abap_true )
    INTO CORRESPONDING FIELDS OF TABLE @gt_data.

  LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_data>).
    <fs_data>-bs_acc = COND #( WHEN <fs_data>-xbilk = abap_true THEN c_yes ELSE c_no ).
    <fs_data>-b1_pos_blck = COND #( WHEN <fs_data>-skb1_xspeb = abap_true THEN c_yes ELSE c_no ).
    <fs_data>-a1_pos_blck = COND #( WHEN <fs_data>-ska1_xspeb = abap_true THEN c_yes ELSE c_no ).
    <fs_data>-a1_cre_blck = COND #( WHEN <fs_data>-xspea = abap_true THEN c_yes ELSE c_no ).
    <fs_data>-a1_del_flag = COND #( WHEN <fs_data>-xloev = abap_true THEN c_yes ELSE c_no ).
    <fs_data>-bs_acc = COND #( WHEN <fs_data>-xbilk = abap_true THEN c_yes ELSE c_no ).
  ENDLOOP.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form display
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM display .
  gt_fcat = VALUE lvc_t_fcat(
 ( fieldname = 'BUKRS'        scrtext_l = 'Company Code' )
 ( fieldname = 'CHRT_ACC'     scrtext_l = 'Chart of Accounts' )
 ( fieldname = 'BS_ACC'       scrtext_l = 'B/S Acct' emphasize = 'C100' )
 ( fieldname = 'GL_ACC'       scrtext_l = 'G/L Acct' emphasize = 'X' edit_mask = '==ALPHA' )
 ( fieldname = 'SHORT_TEXT'   scrtext_l = 'G/L Acct Short text' )
 ( fieldname = 'LONG_TEXT'    scrtext_l = 'G/L Acct Long text' )
 ( fieldname = 'B1_POS_BLCK'  scrtext_l = 'Blocked for Posting' )
 ( fieldname = 'A1_POS_BLCK'  scrtext_l = 'Blocked for Posting(Cocd)' )
 ( fieldname = 'A1_CRE_BLCK'  scrtext_l = 'Blocked for Creation' )
 ( fieldname = 'A1_DEL_FLAG'  scrtext_l = 'Mark for Deletion' )
 ( fieldname = 'CREATED_DATE' scrtext_l = 'Created On' )
 ( fieldname = 'CREATED_BY'   scrtext_l = 'Created By' )
  ).
  gs_layout-cwidth_opt = abap_true.
  gs_layout-zebra = abap_true.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
    EXPORTING
      i_callback_program     = sy-cprog
*     i_callback_user_command  = 'USR_CMD'
      i_callback_top_of_page = 'TOP_PAGE'
      i_html_height_top      = 19
      is_layout_lvc          = gs_layout
      it_fieldcat_lvc        = gt_fcat
      i_default              = 'X'
      i_save                 = 'A'
      is_variant             = gs_variant
    TABLES
      t_outtab               = gt_data
    EXCEPTIONS
      program_error          = 1
      OTHERS                 = 2.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form top_page
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM top_page .
  SELECT SINGLE butxt FROM t001 INTO @DATA(lv_butxt) WHERE bukrs = @p_bukrs.
  gt_header = VALUE slis_t_listheader(
    ( typ = 'H' info = 'G/L Account Details' )
    ( typ = 'S' key  = 'Company:'      info = |{ lv_butxt }| )
    ( typ = 'S' key  = 'Created From:' info = |{ so_date-low+6(2) }.{ so_date-low+4(2) }.{ so_date-low(4) }| )
    ( typ = 'S' key  = 'Created To:'   info = |{ so_date-high+6(2) }.{ so_date-high+4(2) }.{ so_date-high(4) }| )
  ).

  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = gt_header[].
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
