"! Transactional buffer: handlers validate and buffer, the saver writes.
CLASS lcl_buffer DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES tt_db TYPE STANDARD TABLE OF /fs00/almtr018 WITH EMPTY KEY.
    CLASS-DATA: mt_create TYPE tt_db,
                mt_update TYPE tt_db,
                mt_delete TYPE tt_db.
ENDCLASS.

"! Master data the mapping refers to. The ALM tables are small and read once per session;
"! G/L accounts are read per request, for all accounts of the request in one statement.
CLASS lcl_master DEFINITION FINAL.
  PUBLIC SECTION.
    CONSTANTS: BEGIN OF c_kind,
                 alm2   TYPE c LENGTH 2 VALUE 'A2',
                 alm3   TYPE c LENGTH 2 VALUE 'A3',
                 bucket TYPE c LENGTH 2 VALUE 'BU',
                 source TYPE c LENGTH 2 VALUE 'SR',
               END OF c_kind.
    TYPES tt_gl TYPE SORTED TABLE OF /fs00/almtr018-zgl_id WITH UNIQUE KEY table_line.

    "! Text of an ALM group, bucket or source; unbound when the code does not exist.
    CLASS-METHODS text
      IMPORTING iv_kind        TYPE c
                iv_id          TYPE csequence
      RETURNING VALUE(rr_text) TYPE REF TO string.
    CLASS-METHODS prefetch_gl
      IMPORTING it_gl TYPE tt_gl.
    "! Long text of a G/L account in the first chart of accounts that has it; unbound when unknown.
    CLASS-METHODS gl_text
      IMPORTING iv_gl          TYPE /fs00/almtr018-zgl_id
      RETURNING VALUE(rr_text) TYPE REF TO string.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_entry,
             kind TYPE c LENGTH 2,
             id   TYPE c LENGTH 20,
             text TYPE string,
           END OF ty_entry,
           BEGIN OF ty_gl,
             gl   TYPE /fs00/almtr018-zgl_id,
             text TYPE string,
           END OF ty_gl.
    CLASS-DATA: gt_master TYPE HASHED TABLE OF ty_entry WITH UNIQUE KEY kind id,
                gt_gl     TYPE HASHED TABLE OF ty_gl WITH UNIQUE KEY gl,
                gt_no_gl  TYPE tt_gl.
    CLASS-METHODS load.
ENDCLASS.

CLASS lcl_master IMPLEMENTATION.

  METHOD load.
    " The four tables are small master data, read in full once per session.
    SELECT @c_kind-alm2 AS kind, zgrp_id AS id, zgrp_name AS text FROM /fs00/almtr002
      INTO CORRESPONDING FIELDS OF TABLE @gt_master.                  "#EC CI_NOWHERE
    SELECT @c_kind-alm3 AS kind, zgrp_id AS id, zgrp_name AS text FROM /fs00/almtr003
      APPENDING CORRESPONDING FIELDS OF TABLE @gt_master.             "#EC CI_NOWHERE
    SELECT @c_kind-bucket AS kind, CAST( zbuc AS CHAR( 2 ) ) AS id, zdesc AS text FROM /fs00/almtr005
      APPENDING CORRESPONDING FIELDS OF TABLE @gt_master.             "#EC CI_NOWHERE
    SELECT @c_kind-source AS kind, zsrc AS id, zsrc_desc AS text FROM /fs00/almtr008
      APPENDING CORRESPONDING FIELDS OF TABLE @gt_master.             "#EC CI_NOWHERE
  ENDMETHOD.

  METHOD text.
    IF gt_master IS INITIAL.
      load( ).
    ENDIF.
    DATA(lv_id) = CONV ty_entry-id( iv_id ).
    READ TABLE gt_master REFERENCE INTO DATA(lr_entry) WITH TABLE KEY kind = iv_kind id = lv_id.
    IF sy-subrc = 0.
      rr_text = REF #( lr_entry->text ).
    ENDIF.
  ENDMETHOD.

  METHOD prefetch_gl.
    DATA lt_missing TYPE tt_gl.
    LOOP AT it_gl INTO DATA(lv_asked).
      IF lv_asked IS NOT INITIAL
         AND NOT line_exists( gt_gl[ gl = lv_asked ] ) AND NOT line_exists( gt_no_gl[ table_line = lv_asked ] ).
        INSERT lv_asked INTO TABLE lt_missing.
      ENDIF.
    ENDLOOP.
    IF lt_missing IS INITIAL.
      RETURN.
    ENDIF.

    SELECT account~GLAccount, account~ChartOfAccounts, text~GLAccountLongName, text~GLAccountName
      FROM I_GLAccountInChartOfAccounts AS account
        LEFT OUTER JOIN I_GLAccountText AS text ON  text~ChartOfAccounts = account~ChartOfAccounts
                                                AND text~GLAccount       = account~GLAccount
                                                AND text~Language        = @sy-langu
      FOR ALL ENTRIES IN @lt_missing
      WHERE account~GLAccount = @lt_missing-table_line
      INTO TABLE @DATA(lt_found).
    SORT lt_found BY GLAccount ChartOfAccounts.

    LOOP AT lt_missing INTO DATA(lv_gl).
      READ TABLE lt_found INTO DATA(ls_found) WITH KEY GLAccount = lv_gl BINARY SEARCH.
      IF sy-subrc = 0.
        INSERT VALUE #( gl   = lv_gl
                        text = COND #( WHEN ls_found-GLAccountLongName IS NOT INITIAL THEN ls_found-GLAccountLongName
                                       ELSE ls_found-GLAccountName ) ) INTO TABLE gt_gl.
      ELSE.
        INSERT lv_gl INTO TABLE gt_no_gl.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD gl_text.
    prefetch_gl( VALUE #( ( iv_gl ) ) ).
    READ TABLE gt_gl REFERENCE INTO DATA(lr_gl) WITH TABLE KEY gl = iv_gl.
    IF sy-subrc = 0.
      rr_text = REF #( lr_gl->text ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.

"! ALM 2 / ALM 3 G/L mapping on /FS00/ALMTR018, as /FS00/ALMR011 (upload) and /FS00/ALMR016 (manual),
"! with the checks those programs lack. On create every field is checked; on update only the fields sent,
"! so an existing row that breaks a rule can still be corrected field by field (L-612).
CLASS lhc_almglmap DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    CONSTANTS c_entity TYPE string VALUE 'GlMapping'.
    TYPES: BEGIN OF ty_check,
             alm2        TYPE abap_bool,
             source      TYPE abap_bool,
             bucket      TYPE abap_bool,
             alm3_bucket TYPE abap_bool,
             alm3        TYPE abap_bool,
             sensitivity TYPE abap_bool,
             type3       TYPE abap_bool,
           END OF ty_check.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR AlmGlMap RESULT result.
    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE AlmGlMap.
    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE AlmGlMap.
    METHODS delete FOR MODIFY
      IMPORTING keys FOR DELETE AlmGlMap.
    METHODS read FOR READ
      IMPORTING keys FOR READ AlmGlMap RESULT result.
    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK AlmGlMap.

    "! Normalises the codes in the checked fields and derives their descriptions.
    METHODS check_row
      IMPORTING is_check      TYPE ty_check
      CHANGING  cs_db         TYPE /fs00/almtr018
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
    "! Text of a code in an ALM master table; message 002 when the code does not exist.
    METHODS master_text
      IMPORTING iv_kind       TYPE c
                iv_field      TYPE string
                iv_id         TYPE csequence
      EXPORTING ev_text       TYPE csequence
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
    METHODS msg
      IMPORTING iv_no         TYPE symsgno
                iv_v1         TYPE simple OPTIONAL
                iv_v2         TYPE simple OPTIONAL
                iv_v3         TYPE simple OPTIONAL
      RETURNING VALUE(ro_msg) TYPE REF TO if_abap_behv_message.
ENDCLASS.

CLASS lhc_almglmap IMPLEMENTATION.

  METHOD get_global_authorizations.
    " No authorization object guards /FS00/ALMR011 or /FS00/ALMR016; the service's
    " start authorization (IWSV/S_SERVICE) is the gate.
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.

  METHOD create.
    DATA: lt_gl  TYPE lcl_master=>tt_gl,
          lo_msg TYPE REF TO if_abap_behv_message.
    LOOP AT entities ASSIGNING FIELD-SYMBOL(<ls_new>).
      INSERT CONV #( |{ <ls_new>-GLAccount ALPHA = IN }| ) INTO TABLE lt_gl.   " a key sent twice is kept once
    ENDLOOP.
    lcl_master=>prefetch_gl( lt_gl ).
    DATA(ls_all) = VALUE ty_check( alm2 = abap_true source = abap_true bucket = abap_true alm3_bucket = abap_true
                                   alm3 = abap_true sensitivity = abap_true type3 = abap_true ).

    LOOP AT entities INTO DATA(ls_entity).
      DATA(ls_db) = CORRESPONDING /fs00/almtr018( ls_entity MAPPING FROM ENTITY ).
      ls_db-zgl_id = |{ ls_db-zgl_id ALPHA = IN }|.

      CLEAR lo_msg.
      IF ls_db-zgl_id IS INITIAL.
        lo_msg = msg( iv_no = '003' iv_v1 = 'GLAccount' ) ##NO_TEXT.
      ELSE.
        DATA(lr_gl_text) = lcl_master=>gl_text( ls_db-zgl_id ).
        IF lr_gl_text IS BOUND.
          ls_db-zgl_desc = lr_gl_text->*.
          lo_msg = check_row( EXPORTING is_check = ls_all CHANGING cs_db = ls_db ).
        ELSE.
          lo_msg = msg( iv_no = '002' iv_v1 = 'GLAccount' iv_v2 = ls_db-zgl_id ) ##NO_TEXT.
        ENDIF.
      ENDIF.
      IF lo_msg IS NOT BOUND.
        SELECT SINGLE @abap_true FROM /fs00/almtr018
          WHERE zgl_id = @ls_db-zgl_id
          INTO @DATA(lv_exists).
        IF lv_exists = abap_true OR line_exists( lcl_buffer=>mt_create[ zgl_id = ls_db-zgl_id ] ).
          lo_msg = msg( iv_no = '001' iv_v1 = c_entity iv_v2 = ls_db-zgl_id ).
        ENDIF.
        CLEAR lv_exists.
      ENDIF.

      IF lo_msg IS BOUND.
        APPEND VALUE #( %cid = ls_entity-%cid %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-almglmap.
        APPEND VALUE #( %cid = ls_entity-%cid %msg = lo_msg ) TO reported-almglmap.
        CONTINUE.
      ENDIF.

      ls_db = VALUE #( BASE ls_db
                       mandt         = sy-mandt
                       zcreated_by   = sy-uname
                       zcreated_date = sy-datum
                       zcreated_time = sy-uzeit
                       zchanged_by   = sy-uname
                       zchanged_date = sy-datum
                       zchanged_time = sy-uzeit ).
      APPEND ls_db TO lcl_buffer=>mt_create.
      APPEND VALUE #( %cid = ls_entity-%cid GLAccount = ls_db-zgl_id ) TO mapped-almglmap.
    ENDLOOP.
  ENDMETHOD.

  METHOD update.
    IF entities IS INITIAL.
      RETURN.
    ENDIF.
    " The full row is read: UPDATE writes it back whole.
    SELECT * FROM /fs00/almtr018
      FOR ALL ENTRIES IN @entities
      WHERE zgl_id = @entities-GLAccount
      INTO TABLE @DATA(lt_current).                                "#EC CI_ALL_FIELDS_NEEDED
    SORT lt_current BY zgl_id.

    LOOP AT entities INTO DATA(ls_entity).
      READ TABLE lt_current INTO DATA(ls_db) WITH KEY zgl_id = ls_entity-GLAccount BINARY SEARCH.
      IF sy-subrc <> 0.
        APPEND VALUE #( %tky = ls_entity-%tky %fail-cause = if_abap_behv=>cause-not_found ) TO failed-almglmap.
        APPEND VALUE #( %tky = ls_entity-%tky
                        %msg = msg( iv_no = '002' iv_v1 = c_entity iv_v2 = ls_entity-GLAccount ) ) TO reported-almglmap.
        CONTINUE.
      ENDIF.

      ls_db = CORRESPONDING #( BASE ( ls_db ) ls_entity MAPPING FROM ENTITY USING CONTROL ).
      DATA(ls_check) = VALUE ty_check( alm2        = xsdbool( ls_entity-%control-Alm2GroupId = if_abap_behv=>mk-on )
                                       source      = xsdbool( ls_entity-%control-Source      = if_abap_behv=>mk-on )
                                       bucket      = xsdbool( ls_entity-%control-Bucket      = if_abap_behv=>mk-on )
                                       alm3_bucket = xsdbool( ls_entity-%control-Alm3Bucket  = if_abap_behv=>mk-on )
                                       alm3        = xsdbool( ls_entity-%control-Alm3GroupId = if_abap_behv=>mk-on )
                                       sensitivity = xsdbool( ls_entity-%control-Sensitivity = if_abap_behv=>mk-on )
                                       type3       = xsdbool( ls_entity-%control-Type3       = if_abap_behv=>mk-on ) ).
      DATA(lo_msg) = check_row( EXPORTING is_check = ls_check CHANGING cs_db = ls_db ).
      IF lo_msg IS BOUND.
        APPEND VALUE #( %tky = ls_entity-%tky %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-almglmap.
        APPEND VALUE #( %tky = ls_entity-%tky %msg = lo_msg ) TO reported-almglmap.
        CONTINUE.
      ENDIF.

      " The G/L text is derived, so it is refreshed on every change.
      DATA(lr_gl_text) = lcl_master=>gl_text( ls_db-zgl_id ).
      IF lr_gl_text IS BOUND.
        ls_db-zgl_desc = lr_gl_text->*.
      ENDIF.
      ls_db = VALUE #( BASE ls_db
                       zchanged_by   = sy-uname
                       zchanged_date = sy-datum
                       zchanged_time = sy-uzeit ).
      DELETE lcl_buffer=>mt_update WHERE zgl_id = ls_db-zgl_id.
      APPEND ls_db TO lcl_buffer=>mt_update.
    ENDLOOP.
  ENDMETHOD.

  METHOD delete.
    IF keys IS INITIAL.
      RETURN.
    ENDIF.
    DATA lt_current TYPE lcl_master=>tt_gl.
    SELECT zgl_id FROM /fs00/almtr018
      FOR ALL ENTRIES IN @keys
      WHERE zgl_id = @keys-GLAccount
      INTO TABLE @lt_current.

    LOOP AT keys INTO DATA(ls_key).
      IF line_exists( lt_current[ table_line = ls_key-GLAccount ] ).
        APPEND VALUE #( zgl_id = ls_key-GLAccount ) TO lcl_buffer=>mt_delete.   " DELETE ... FROM TABLE needs the key only
      ELSE.
        APPEND VALUE #( GLAccount = ls_key-GLAccount %fail-cause = if_abap_behv=>cause-not_found ) TO failed-almglmap.
        APPEND VALUE #( GLAccount = ls_key-GLAccount
                        %msg      = msg( iv_no = '002' iv_v1 = c_entity iv_v2 = ls_key-GLAccount ) ) TO reported-almglmap.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD read.
    IF keys IS INITIAL.
      RETURN.
    ENDIF.
    " READ returns every field of the entity.
    SELECT * FROM zfs_i_almglmap
      FOR ALL ENTRIES IN @keys
      WHERE GLAccount = @keys-GLAccount
      INTO TABLE @DATA(lt_rows).                                   "#EC CI_ALL_FIELDS_NEEDED
    SORT lt_rows BY GLAccount.

    LOOP AT keys INTO DATA(ls_key).
      READ TABLE lt_rows INTO DATA(ls_row) WITH KEY GLAccount = ls_key-GLAccount BINARY SEARCH.
      IF sy-subrc = 0.
        APPEND CORRESPONDING #( ls_row ) TO result.
      ELSE.
        APPEND VALUE #( GLAccount = ls_key-GLAccount %fail-cause = if_abap_behv=>cause-not_found ) TO failed-almglmap.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD lock.
    TRY.
        DATA(lo_lock) = cl_abap_lock_object_factory=>get_instance( iv_name = 'EZFS_T_ALMGLMAP' ).
      CATCH cx_abap_lock_failure.
        LOOP AT keys INTO DATA(ls_fail).
          APPEND VALUE #( GLAccount = ls_fail-GLAccount %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-almglmap.
          APPEND VALUE #( GLAccount = ls_fail-GLAccount
                          %msg      = msg( iv_no = '005' iv_v1 = c_entity iv_v2 = ls_fail-GLAccount ) ) TO reported-almglmap.
        ENDLOOP.
        RETURN.
    ENDTRY.

    LOOP AT keys INTO DATA(ls_key).
      TRY.
          lo_lock->enqueue( it_parameter = VALUE #( ( name = 'ZGL_ID' value = REF #( ls_key-GLAccount ) ) ) ).
        CATCH cx_abap_foreign_lock INTO DATA(lx_foreign).
          APPEND VALUE #( GLAccount = ls_key-GLAccount %fail-cause = if_abap_behv=>cause-locked ) TO failed-almglmap.
          APPEND VALUE #( GLAccount = ls_key-GLAccount
                          %msg      = msg( iv_no = '004' iv_v1 = c_entity iv_v2 = ls_key-GLAccount
                                           iv_v3 = lx_foreign->user_name ) ) TO reported-almglmap.
        CATCH cx_abap_lock_failure.
          APPEND VALUE #( GLAccount = ls_key-GLAccount %fail-cause = if_abap_behv=>cause-unspecific ) TO failed-almglmap.
          APPEND VALUE #( GLAccount = ls_key-GLAccount
                          %msg      = msg( iv_no = '005' iv_v1 = c_entity iv_v2 = ls_key-GLAccount ) ) TO reported-almglmap.
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.

  METHOD check_row.
    " Message variables &1 are technical property names, not translatable text.
    IF is_check-alm2 = abap_true.
      cs_db-zgr_id = to_upper( condense( cs_db-zgr_id ) ).
      ro_msg = master_text( EXPORTING iv_kind = lcl_master=>c_kind-alm2 iv_field = `Alm2GroupId` iv_id = cs_db-zgr_id
                            IMPORTING ev_text = cs_db-zgr_desc ) ##NO_TEXT.
      IF ro_msg IS BOUND.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_check-source = abap_true.
      cs_db-zcal = to_upper( condense( cs_db-zcal ) ).
      ro_msg = master_text( EXPORTING iv_kind = lcl_master=>c_kind-source iv_field = `Source` iv_id = cs_db-zcal
                            IMPORTING ev_text = cs_db-zcal_desc ) ##NO_TEXT.
      IF ro_msg IS BOUND.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_check-bucket = abap_true.
      ro_msg = master_text( EXPORTING iv_kind  = lcl_master=>c_kind-bucket iv_field = `Bucket`
                                      iv_id    = COND string( WHEN cs_db-zbu_id IS NOT INITIAL THEN cs_db-zbu_id )
                            IMPORTING ev_text  = cs_db-zbu_desc ) ##NO_TEXT.
      IF ro_msg IS BOUND.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_check-alm3_bucket = abap_true.
      ro_msg = master_text( EXPORTING iv_kind  = lcl_master=>c_kind-bucket iv_field = `Alm3Bucket`
                                      iv_id    = COND string( WHEN cs_db-zbu3_id IS NOT INITIAL THEN cs_db-zbu3_id )
                            IMPORTING ev_text  = cs_db-zbu3_desc ) ##NO_TEXT.
      IF ro_msg IS BOUND.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_check-alm3 = abap_true.
      cs_db-zgrp_id = to_upper( condense( cs_db-zgrp_id ) ).
      ro_msg = master_text( EXPORTING iv_kind = lcl_master=>c_kind-alm3 iv_field = `Alm3GroupId` iv_id = cs_db-zgrp_id
                            IMPORTING ev_text = cs_db-zgrp_name ) ##NO_TEXT.
      IF ro_msg IS BOUND.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_check-type3 = abap_true.
      " Not checked against domain /FS00/ALMDM0008: the stored values (IA/IB) do not follow it (L-612).
      cs_db-ztype3 = to_upper( condense( cs_db-ztype3 ) ).
    ENDIF.
    IF is_check-sensitivity = abap_true AND cs_db-zsns IS NOT INITIAL.
      DATA(lt_fixed) = CAST cl_abap_elemdescr( cl_abap_typedescr=>describe_by_data( cs_db-zsns ) )->get_ddic_fixed_values( ).
      IF NOT line_exists( lt_fixed[ low = cs_db-zsns ] ).
        ro_msg = msg( iv_no = '002' iv_v1 = 'Sensitivity' iv_v2 = cs_db-zsns ) ##NO_TEXT.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD master_text.
    CLEAR ev_text.
    IF iv_id IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lr_text) = lcl_master=>text( iv_kind = iv_kind iv_id = iv_id ).
    IF lr_text IS BOUND.
      ev_text = lr_text->*.
    ELSE.
      ro_msg = msg( iv_no = '002' iv_v1 = iv_field iv_v2 = iv_id ).
    ENDIF.
  ENDMETHOD.

  METHOD msg.
    ro_msg = new_message( id       = 'ZFS_TRM_MSG'
                          number   = iv_no
                          severity = if_abap_behv_message=>severity-error
                          v1       = iv_v1
                          v2       = iv_v2
                          v3       = iv_v3 ).
  ENDMETHOD.

ENDCLASS.

CLASS lsc_almglmap DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS check_before_save REDEFINITION.
    METHODS save REDEFINITION.
    METHODS cleanup REDEFINITION.
ENDCLASS.

CLASS lsc_almglmap IMPLEMENTATION.

  METHOD check_before_save.
    " A concurrent create of the same key can land between create and save.
    IF lcl_buffer=>mt_create IS INITIAL.
      RETURN.
    ENDIF.
    SELECT zgl_id FROM /fs00/almtr018
      FOR ALL ENTRIES IN @lcl_buffer=>mt_create
      WHERE zgl_id = @lcl_buffer=>mt_create-zgl_id
      INTO TABLE @DATA(lt_taken).
    LOOP AT lt_taken INTO DATA(ls_taken).
      APPEND VALUE #( GLAccount = ls_taken-zgl_id %fail-cause = if_abap_behv=>cause-conflict ) TO failed-almglmap.
      APPEND VALUE #( GLAccount = ls_taken-zgl_id
                      %msg      = new_message( id       = 'ZFS_TRM_MSG'
                                               number   = '001'
                                               severity = if_abap_behv_message=>severity-error
                                               v1       = 'GlMapping'
                                               v2       = ls_taken-zgl_id ) ) TO reported-almglmap.
    ENDLOOP.
  ENDMETHOD.

  METHOD save.
    IF lcl_buffer=>mt_create IS NOT INITIAL.
      INSERT /fs00/almtr018 FROM TABLE @lcl_buffer=>mt_create.
    ENDIF.
    IF lcl_buffer=>mt_update IS NOT INITIAL.
      UPDATE /fs00/almtr018 FROM TABLE @lcl_buffer=>mt_update.
    ENDIF.
    IF lcl_buffer=>mt_delete IS NOT INITIAL.
      DELETE /fs00/almtr018 FROM TABLE @lcl_buffer=>mt_delete.
    ENDIF.
  ENDMETHOD.

  METHOD cleanup.
    CLEAR: lcl_buffer=>mt_create, lcl_buffer=>mt_update, lcl_buffer=>mt_delete.
  ENDMETHOD.

ENDCLASS.
