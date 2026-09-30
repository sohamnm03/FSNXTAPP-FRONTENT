class ZCL_ZVIM_DPC_EXT definition
  public
  inheriting from ZCL_ZVIM_DPC
  create public .

public section.
protected section.

  methods EXTRACTSET_CREATE_ENTITY
    redefinition .
private section.
ENDCLASS.



CLASS ZCL_ZVIM_DPC_EXT IMPLEMENTATION.


METHOD extractset_create_entity.
*METHOD extractset_create_entity.
*
*
*  DATA: ls_input     TYPE zstr_fi_vim_extract,
*        ls_response  TYPE zstr_fi_vim_extract,
*        lv_getdata   TYPE string,
*        lv_file_id   TYPE string,
*        lv_file_name TYPE string,
*        lv_bukrs     TYPE bukrs,
*        lv_message   TYPE string,
*        lv_action    TYPE string.
*
*
*  TRY.
*
*      io_data_provider->read_entry_data(
*        IMPORTING
*          es_data = ls_input ).
*
*      lv_action = ls_input-message.
*      TRANSLATE lv_action TO UPPER CASE.
*
*      "Only one GETDATA field exists in ZSTR_FI_VIM_EXTRACT
*      lv_getdata = ls_input-getdata.
*
*      SHIFT lv_getdata LEFT DELETING LEADING space.
*      SHIFT lv_getdata RIGHT DELETING TRAILING space.
*
*      IF lv_getdata IS INITIAL.
*        ls_response = ls_input.
*        ls_response-message = 'GETDATA payload missing from Fiori request'.
*        er_entity = ls_response.
*        RETURN.
*      ENDIF.
*      BREAK-POINT.
*      IF lv_action = 'PARK_DOCUMENT'.
*
*        PERFORM park_document_from_getdata IN PROGRAM zfs_vim_odata
*          USING lv_getdata
*          CHANGING lv_file_id
*                   lv_file_name
*                   lv_bukrs
*                   lv_message
*          IF FOUND.
*
*      ELSE.
*
*        PERFORM upload_dms_from_getdata IN PROGRAM zfs_vim_odata
*          USING lv_getdata
*          CHANGING lv_file_id
*                   lv_file_name
*                   lv_bukrs
*                   lv_message
*          IF FOUND.
*
*      ENDIF.
*
*      IF sy-subrc <> 0.
*        ls_response = ls_input.
*        ls_response-message = 'FORM upload_dms_from_getdata not found in ZFS_VIM_ODATA'.
*        er_entity = ls_response.
*        RETURN.
*      ENDIF.
*
*      ls_response = ls_input.
*      ls_response-file_id   = lv_file_id.
*      ls_response-file_name = lv_file_name.
*      ls_response-bukrs     = lv_bukrs.
*      ls_response-message   = lv_message.
*
*      er_entity = ls_response.
*
*    CATCH cx_root INTO DATA(lx_root).
*
*      ls_response = ls_input.
*      ls_response-message = lx_root->get_text( ).
*      er_entity = ls_response.
*
*  ENDTRY.
*
*ENDMETHOD.


*&---------------------------------------------------------------------*
*& ZCL_ZVIM_DPC_EXT -> EXTRACTSET_CREATE_ENTITY  (full replacement)
*&
*& Adds a new, self-contained action:  Message = 'PARK_SIMPLE'
*&   - Parks an FI vendor invoice (FV60 style, doc type KR)
*&   - 1 vendor line (credit) + 1 G/L line (debit), no tax / no TDS
*&   - BAPI_ACC_DOCUMENT_POST with BUS_ACT = 'RFBV', DOC_STATUS = '2'
*&   - Returns parked doc number in FILE_ID and MESSAGE
*&   - Errors are returned as HTTP 400 with the SAP message text
*&
*& Existing actions (PARK_DOCUMENT / DMS upload) are unchanged.
*& No SEGW / model change needed - just paste, activate, test.
*&---------------------------------------------------------------------*

  DATA: ls_input     TYPE zstr_fi_vim_extract,
        ls_response  TYPE zstr_fi_vim_extract,
        lv_getdata   TYPE string,
        lv_file_id   TYPE string,
        lv_file_name TYPE string,
        lv_bukrs     TYPE bukrs,
        lv_message   TYPE string,
        lv_action    TYPE string.

  io_data_provider->read_entry_data( IMPORTING es_data = ls_input ).

  lv_action = ls_input-message.
  TRANSLATE lv_action TO UPPER CASE.
  CONDENSE lv_action NO-GAPS.

  lv_getdata = ls_input-getdata.
  SHIFT lv_getdata LEFT DELETING LEADING space.

  IF lv_getdata IS INITIAL.
    ls_response = ls_input.
    ls_response-message = 'GETDATA payload missing from request'.
    er_entity = ls_response.
    RETURN.
  ENDIF.

*======================================================================*
* NEW: simple FV60-style parking
*======================================================================*
  IF lv_action = 'PARK_SIMPLE'.

    DATA: lt_pairs   TYPE STANDARD TABLE OF string,
          lv_pair    TYPE string,
          lv_key     TYPE string,
          lv_val     TYPE string,
          ls_header  TYPE bapiache09,
          lt_gl      TYPE STANDARD TABLE OF bapiacgl09,
          lt_ap      TYPE STANDARD TABLE OF bapiacap09,
          lt_amt     TYPE STANDARD TABLE OF bapiaccr09,
          lt_return  TYPE STANDARD TABLE OF bapiret2,
          lv_obj_key TYPE bapiache09-obj_key,
          lv_vendor  TYPE lifnr,
          lv_gl      TYPE hkont,
          lv_kostl   TYPE kostl,
          lv_amount  TYPE bapidoccur,
          lv_curr    TYPE waers,
          lv_text    TYPE sgtxt,
          lv_err     TYPE string.

*   Header defaults: park an FI vendor invoice
    ls_header-bus_act    = 'RFBV'.        " parking (SAP Note 2092366)
    ls_header-doc_status = '2'.           " 2 = parked
    ls_header-doc_type   = 'KR'.
    ls_header-username   = sy-uname.

*   Parse GETDATA:  key=value&key=value...
    SPLIT lv_getdata AT '&' INTO TABLE lt_pairs.
    LOOP AT lt_pairs INTO lv_pair.
      CLEAR: lv_key, lv_val.
      SPLIT lv_pair AT '=' INTO lv_key lv_val.
      lv_val = cl_http_utility=>unescape_url( lv_val ).
      CONDENSE lv_key NO-GAPS.
      TRANSLATE lv_key TO LOWER CASE.

      CASE lv_key.
        WHEN 'bukrs'.       ls_header-comp_code  = lv_val.
        WHEN 'doc_type'.    ls_header-doc_type   = lv_val.
        WHEN 'doc_date'.    ls_header-doc_date   = lv_val.   " YYYYMMDD
        WHEN 'pstng_date'.  ls_header-pstng_date = lv_val.   " YYYYMMDD
        WHEN 'reference'.   ls_header-ref_doc_no = lv_val.
        WHEN 'header_txt'.  ls_header-header_txt = lv_val.
        WHEN 'vendor'.      lv_vendor = lv_val.
        WHEN 'gl_account'.  lv_gl     = lv_val.
        WHEN 'costcenter'.  lv_kostl  = lv_val.
        WHEN 'item_text'.   lv_text   = lv_val.
        WHEN 'currency'.    lv_curr   = lv_val.
        WHEN 'amount'.
          REPLACE ALL OCCURRENCES OF ',' IN lv_val WITH ''.
          CONDENSE lv_val NO-GAPS.
          lv_amount = lv_val.
      ENDCASE.
    ENDLOOP.

*   Leading zeros
    lv_vendor = |{ lv_vendor ALPHA = IN }|.
    lv_gl     = |{ lv_gl ALPHA = IN }|.
    IF lv_kostl IS NOT INITIAL.
      lv_kostl = |{ lv_kostl ALPHA = IN }|.
    ENDIF.

*   Date defaults
    IF ls_header-pstng_date IS INITIAL.
      ls_header-pstng_date = sy-datum.
    ENDIF.
    IF ls_header-doc_date IS INITIAL.
      ls_header-doc_date = ls_header-pstng_date.
    ENDIF.
    ls_header-trans_date = ls_header-pstng_date.

*   Mandatory field check
    IF ls_header-comp_code IS INITIAL OR lv_vendor IS INITIAL
       OR lv_gl IS INITIAL OR lv_amount IS INITIAL OR lv_curr IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Mandatory: bukrs, vendor, gl_account, amount, currency'.
    ENDIF.

*   Line 1: vendor (credit)
    APPEND VALUE #( itemno_acc = 1
                    vendor_no  = lv_vendor
                    comp_code  = ls_header-comp_code
                    item_text  = lv_text ) TO lt_ap.
    APPEND VALUE #( itemno_acc = 1
                    currency   = lv_curr
                    amt_doccur = lv_amount * -1 ) TO lt_amt.

*   Line 2: G/L (debit)
    APPEND VALUE #( itemno_acc = 2
                    gl_account = lv_gl
                    comp_code  = ls_header-comp_code
                    costcenter = lv_kostl
                    item_text  = lv_text ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 2
                    currency   = lv_curr
                    amt_doccur = lv_amount ) TO lt_amt.

*   Park
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = ls_header
      IMPORTING
        obj_key        = lv_obj_key
      TABLES
        accountgl      = lt_gl
        accountpayable = lt_ap
        currencyamount = lt_amt
        return         = lt_return.

*   Collect errors
    LOOP AT lt_return INTO DATA(ls_ret) WHERE type CA 'EAX'.
      IF lv_err IS INITIAL.
        lv_err = ls_ret-message.
      ELSE.
        CONCATENATE lv_err ls_ret-message INTO lv_err SEPARATED BY ' / '.
      ENDIF.
    ENDLOOP.

    IF lv_err IS NOT INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = CONV bapi_msg( lv_err ).
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   OBJ_KEY = doc number (10) + company code (4) + fiscal year (4)
    ls_response         = ls_input.
    ls_response-file_id = lv_obj_key(10).
    ls_response-bukrs   = ls_header-comp_code.
    ls_response-message = |PARKED { lv_obj_key(10) } { ls_header-comp_code } { lv_obj_key+14(4) }|.
    er_entity = ls_response.
    RETURN.

  ENDIF.

*======================================================================*
* EXISTING logic (unchanged): PARK_DOCUMENT / DMS upload
*======================================================================*
  TRY.

      IF lv_action = 'PARK_DOCUMENT'.

        PERFORM park_document_from_getdata IN PROGRAM zfs_vim_odata
          USING lv_getdata
          CHANGING lv_file_id
                   lv_file_name
                   lv_bukrs
                   lv_message
          IF FOUND.

      ELSE.

        PERFORM upload_dms_from_getdata IN PROGRAM zfs_vim_odata
          USING lv_getdata
          CHANGING lv_file_id
                   lv_file_name
                   lv_bukrs
                   lv_message
          IF FOUND.

      ENDIF.

      IF lv_message IS INITIAL.
        ls_response = ls_input.
        ls_response-message = 'FORM not found in ZFS_VIM_ODATA'.
        er_entity = ls_response.
        RETURN.
      ENDIF.

      ls_response = ls_input.
      ls_response-file_id   = lv_file_id.
      ls_response-file_name = lv_file_name.
      ls_response-bukrs     = lv_bukrs.
      ls_response-message   = lv_message.

      er_entity = ls_response.

    CATCH cx_root INTO DATA(lx_root).

      ls_response = ls_input.
      ls_response-message = lx_root->get_text( ).
      er_entity = ls_response.

  ENDTRY.

ENDMETHOD.
ENDCLASS.