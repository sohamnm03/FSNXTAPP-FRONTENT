*&---------------------------------------------------------------------*
*& Include          ZFS_PS_R002_TOP
*&---------------------------------------------------------------------*
REPORT ZFS_VIM_ODATA MESSAGE-ID /fspl/zmsg1.



TYPES: BEGIN OF ty_params,
         hd_comp_code    TYPE bukrs,
         hd_doc_type     TYPE blart,
         hd_doc_date     TYPE dats,
         hd_pstng_date   TYPE dats,
         hd_ref_doc_no   TYPE string,
         hd_header_txt   TYPE string,
         hd_doc_status   TYPE string,
         hd_fisc_year    TYPE gjahr,
         gl1_account     TYPE saknr,
         gl1_cc          TYPE kostl,
         gl1_ba          TYPE gsber,
         gl1_tax_code    TYPE mwskz,
         gl1_item_text   TYPE string,
         gl1_amt_doccur  TYPE tpm_amount, "string,
         gl1_curr        TYPE waers,
         ap2_vendor      TYPE lifnr,
         ap2_item_text   TYPE string,
         ap2_ba          TYPE gsber,
         ap2_bplace      TYPE string,
         ap2_sec_code    TYPE string,
         ap2_tax_code    TYPE mwskz,
         ap2_amt_doccur  TYPE tpm_amount, "string,
         ap2_curr        TYPE waers,
         wt3_type        TYPE string,
         wt3_code        TYPE string,
         wt3_bas_amt_tc  TYPE string,
         wt3_man_amt_tc  TYPE string,
         wt3_has_tds     TYPE string,
         s_amt           TYPE tpm_amount, "string,
         s_gst_amt       TYPE tpm_amount, "string,
         s_tds_amt       TYPE tpm_amount, "string,
         s_tds_rate      TYPE string,
         s_gst_code      TYPE mwskz,
         s_curr          TYPE waers,
         " fetch_gst params
         mwskz           TYPE mwskz,
         waers           TYPE waers,
         wrbtr           TYPE string,
         " fetch_tds params
         lifnr           TYPE lifnr,
         witht           TYPE string,
         wt_withcd       TYPE string,
         file_name       TYPE string,
         file_path       TYPE text255,
         ocr_vendor      TYPE string,
         ocr_vendor_no   TYPE string,
         ocr_vendor_addr TYPE string,
         ocr_inv_no      TYPE string,
         ocr_inv_date    TYPE string,
         ocr_customer    TYPE string,
         ocr_subtotal    TYPE string,
         ocr_tax         TYPE string,
         ocr_total       TYPE string,
         ocr_currency    TYPE waers,
         ocr_confidence  TYPE string,
         ocr_line_count  TYPE string,
         upl_id          TYPE string,
         upl_name        TYPE string,
         upl_path        TYPE string,
         std_dms         TYPE string,
         doc_no          TYPE string,

         " Explicit GST tax line fields (no auto-calculation)
         tx4_code        TYPE mwskz,        " GST tax code
         tx4_base_amt    TYPE tpm_amount,   " Net base amount before GST
         tx4_cgst_amt    TYPE tpm_amount,   " CGST portion
         tx4_sgst_amt    TYPE tpm_amount,   " SGST portion
         tx4_igst_amt    TYPE tpm_amount,   " IGST amount (interstate)
         tx4_gl_cgst     TYPE saknr,        " GL account for CGST (j_1it030k JICG)
         tx4_gl_sgst     TYPE saknr,        " GL account for SGST (j_1it030k JISG)
         tx4_gl_igst     TYPE saknr,        " GL account for IGST (j_1it030k JIIG
       END OF ty_params.


DATA: go_container   TYPE REF TO cl_gui_custom_container,
      go_html_viewer TYPE REF TO cl_gui_html_viewer.

DATA: gv_cocode      TYPE string,   "  ZFI_COCODE  -> T001
      gv_actype      TYPE string,   "  ZFI_ACTYPE  -> custom list
      gv_vendor      TYPE string,   "  ZFI_VENDOR  -> LFA1 + LFB1
      gv_gl          TYPE string,   "  ZFI_GL      -> SKAT + T001
      gv_cctr        TYPE string,   "  ZFI_CCTR    -> CSKT
      gv_ba          TYPE string,   "  ZFI_BA      -> TGSBT
      gv_bplace      TYPE string,   "  ZFI_BPLACE  -> J_1BBRANCH + J_1BBRANCHT
      gv_gst         TYPE string,   "  ZFI_GST     -> T007S (kalsm=ZAXINN)
      gv_sec         TYPE string,   "  ZFI_SEC     -> SECCODET
      gv_curr        TYPE string,   "  ZFI_CURR    -> TCURT
      gv_wtype       TYPE string,   "  ZFI_WTYPE   -> T059P
      gv_wtax        TYPE string,   "  ZFI_WTAX    -> T059Z
      gv_prepgl      TYPE string,   "  ZFI_PREPGL  -> /FSPL/FI_T016
      gv_ocr_records TYPE string VALUE 'ZFI_OCR_RECORDS',
      gv_inv_list    TYPE string VALUE 'ZFI_INV_LIST',
      gv_lfbw        TYPE string VALUE 'ZFI_LFBW',
      gv_tdsgl       TYPE string VALUE 'ZFI_TDSGL',
      gv_taxgl       TYPE string VALUE 'ZFI_TAXGL',
      gv_parked_ids  TYPE string
      .


DATA: gv_park_docno TYPE string VALUE 'ZFI_PARK_DOCNO',
      gv_park_error TYPE string VALUE 'ZFI_PARK_ERROR'.

DATA: gt_events TYPE cntl_simple_events,
      gs_event  TYPE cntl_simple_event.

DATA: gt_return TYPE TABLE OF bapiret2,
      gs_return TYPE bapiret2.

DATA: gv_itemno   TYPE i,
      gv_obj_type TYPE bapiache09-obj_type,
      gv_obj_key  TYPE bapiache09-obj_key,
      gv_obj_sys  TYPE bapiache09-obj_sys,
      gv_fwste    TYPE bset-fwste,
      gt_taxamt   TYPE TABLE OF rtax1u15.

DATA: gs_documentheader    TYPE bapiache09,
      gs_accountgl         TYPE bapiacgl09,
      gt_accountgl         TYPE TABLE OF bapiacgl09,
      gs_accountpayable    TYPE bapiacap09,
      gt_accountpayable    TYPE TABLE OF bapiacap09,
      gs_accountreceivable TYPE bapiacar09,
      gt_accountreceivable TYPE TABLE OF bapiacar09,
      gs_accounttax        TYPE bapiactx09,
      gt_accounttax        TYPE TABLE OF bapiactx09,
      gs_accountwt         TYPE bapiacwt09,
      gt_accountwt         TYPE TABLE OF bapiacwt09,
      gs_currencyamount    TYPE bapiaccr09,
      gt_currencyamount    TYPE TABLE OF bapiaccr09,
      gs_extension1        TYPE bapiacextc,
      gt_extension1        TYPE TABLE OF bapiacextc,

      out_dms              TYPE zfs_ps_t003,

      gs_t001              TYPE zfs_ps_t001,
      gs_t002              TYPE zfs_ps_t002,
      gs_t003              TYPE zfs_ps_t003.

*----------------------------------------------------------------------*
*  LOCAL CLASS: EVENT HANDLER
*----------------------------------------------------------------------*
CLASS lcl_html_event DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS:
      on_sapevent
        FOR EVENT sapevent OF cl_gui_html_viewer
        IMPORTING
          action
          frame
          getdata
          postdata
          query_table
          sender.
ENDCLASS.

DATA: go_handler TYPE REF TO lcl_html_event.

*----------------------------------------------------------------------*
*  LOCAL CLASS: JSON BUILDER
*----------------------------------------------------------------------*
CLASS lcl_json_builder DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS:

      escape_json_string
        IMPORTING iv_value        TYPE csequence
        RETURNING VALUE(rv_value) TYPE string,

      build_json_field
        IMPORTING iv_key          TYPE string
                  iv_value        TYPE csequence
                  iv_numeric      TYPE abap_bool DEFAULT abap_false
        RETURNING VALUE(rv_field) TYPE string,

      build_payload_cocode
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_actype
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_vendor
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_gl
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_cctr
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_ba
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_bplace
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_gst
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_sec
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_curr
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_wtype
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_wtax
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_prepgl
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_ocr_invoices
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_lfbw
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_tdsgl
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_taxgl
        RETURNING VALUE(rv_json) TYPE string,

      build_payload_parked_ids
        RETURNING VALUE(rv_json) TYPE string
        .

ENDCLASS.

*----------------------------------------------------------------------*
*  LOCAL CLASS: HTML DISPLAY
*----------------------------------------------------------------------*
CLASS lcl_html_display DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS:
      display_html
        IMPORTING iv_html TYPE string,
      show_error_html
        IMPORTING iv_message     TYPE string
                  iv_status_code TYPE i.
ENDCLASS.

DATA: gs_t018       TYPE zfs_t_018,
      gs_t032       TYPE zfs_t_032,
      gv_zdoc_name  TYPE char255,
      gv_size       TYPE i,
      gs_return1    TYPE bapiret2,
      c_kb          TYPE char5,
      c_mb          TYPE char5,
      gv_dummy      TYPE char20,
      gv_doctype_cr TYPE dokar,
      gv_fname      TYPE rlgrap-filename,
      c_ver         TYPE dokvr,
      gv_num        TYPE char10.

DATA : lt_documentfile   LIKE bapi_doc_files2,
       org_path          TYPE text255,
       lt_rtn            TYPE bapiret2,
       lt_documentfile_1 TYPE TABLE OF bapi_doc_files2,
       lw_documentfile_1 TYPE bapi_doc_files2,
       lv_target_path    TYPE filep.
DATA: ls_documentdatax TYPE bapi_doc_drawx2. "Indicator for Relevancy to Change

"Constant
CONSTANTS: c_wt     TYPE string VALUE 'Please Select Folder',
           c_dctyp  TYPE char3 VALUE 'TRM',
           c_dcprt  TYPE doktl_d VALUE '000',
           c_dcvrsn TYPE dokvr VALUE '00',
           c_e(1)   VALUE 'E'.

CONSTANTS: c_m(1)    VALUE '-', "declared constants {
           c_x(1)    VALUE 'X',
           c_trm(3)  VALUE 'TRM',
           c_jpg(3)  VALUE 'jpg',
           c_jpeg(4) VALUE 'jpeg',
           c_png(3)  VALUE 'png',
           c_csv(3)  VALUE 'csv'. "}



CONSTANTS: c_lcp(3) VALUE 'LCP',
           c_d34(3) VALUE 'D34',
           c_d35(3) VALUE 'D35',
           c_d38(3) VALUE 'D38',
           c_d39(3) VALUE 'D39'.
DATA: gt_documentfiles TYPE TABLE OF bapi_doc_files2,
      documentfiles    TYPE TABLE OF bapi_doc_files2,
      lt_dms_code      TYPE char25.

"Fieldcatalog
DATA: gt_fieldcat TYPE lvc_t_fcat,
      gs_fieldcat TYPE lvc_s_fcat.

"" DMS Declr
DATA: lv_file_path        TYPE text255.
DATA: lv_dummy TYPE text20.
DATA: lt_files        TYPE TABLE OF bapi_doc_files2,
      lw_files        TYPE bapi_doc_files2,
      ls_documentdata TYPE bapi_doc_draw2,
      lv_dctyp        TYPE dokar,
      lv_docnr        TYPE doknr,
      lv_docpr        TYPE doktl_d,
      lv_docvr        TYPE dokvr,
      ls_ret          TYPE bapiret2,
      lv_msg(120)     TYPE c,
      wsapp           TYPE dappl,
      lv_size         TYPE i,
      lv_source_path  TYPE rlgrap-filename,
      lv_mb           TYPE p DECIMALS 2,
      lv_kb           TYPE p DECIMALS 2..



DATA: gv_file     TYPE rlgrap-filename,
      gv_doc      TYPE c LENGTH 3,
      gv_dms_code TYPE c LENGTH 25,
      gv_src_path TYPE c LENGTH 255..

DATA :gv_path_len  TYPE n LENGTH 3,
      gv_file_path TYPE text255,
      gv_ans       TYPE c,
      gv_down_path TYPE string,
      gv_view_path TYPE char200,
      gv_flag_bulk TYPE flag,
      gv_view_flag TYPE flag.