class ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT definition
  public
  inheriting from ZCL_ZFS_BEACON_ACCOUNT_DPC
  create public .

public section.

  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_EXPANDED_ENTITY
    redefinition .
protected section.

  methods ZFS_T_091_ITSET_GET_ENTITYSET
    redefinition .
private section.

  "! Added by FS_DEV3 on 24.09.2026 (DS4K907342) - security audit, XSS input guard.<br/>
  "! Rejects the request when any character field contains &lt; or &gt;.
  "! @parameter is_header | Deep-insert header (position 0)
  "! @parameter it_items | NP_ACC lines (position 1..n)
  "! @raising /iwbep/cx_mgw_busi_exception | One ZFS_TRM_MSG 055 per offending field, HTTP 400
  methods CHECK_NO_MARKUP
    importing
      !IS_HEADER type ANY
      !IT_ITEMS type ANY TABLE
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION .
ENDCLASS.



CLASS ZCL_ZFS_BEACON_ACCOUNT_DPC_EXT IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
*&---------------------------------------------------------------------*
* Change History:
*&---------------------------------------------------------------------*
* Technical Consultant     : FS_DEV3
* Date of Change           : 24.09.2026
* Transport Request Number : DS4K907342
* Description              : Security audit - "Accepting Script and HTML
*                            Tags". The payload is checked by
*                            CHECK_NO_MARKUP before anything is saved or
*                            the posting job is started; a request with
*                            < or > in any character field is rejected
*                            with HTTP 400 (ZFS_TRM_MSG 055).
*&---------------------------------------------------------------------*

    DATA: ls_header              TYPE ihttpnvp.
    DATA : BEGIN OF deepstructure.
             INCLUDE TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_s_018_hd.
    DATA :   np_acc TYPE zcl_zfs_beacon_account_mpc=>tt_zfs_s_018_it,
           END OF deepstructure.

    DATA : BEGIN OF deepstructure1.
             INCLUDE TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_s_018_hd.
    DATA :   requestid TYPE zfs_t_072-request_id,
             zstatus   TYPE char10,
             message   TYPE char50,
           END OF deepstructure1.

    DATA : wa_dp LIKE deepstructure.
    DATA : wa_np_acc TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_s_018_it.

    DATA : wa_rep LIKE deepstructure.

    DATA : wa_zfs_t_072 TYPE zfs_t_072,
           it_zfs_t_072 TYPE STANDARD TABLE OF zfs_t_072.

*""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    DATA: lv_jobname  TYPE btcjob,
          lv_jobcount TYPE btcjobcnt,
          lv_variant  TYPE disvariant VALUE 'VARIANT_NAME'. " Optional if report uses a variant
*""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

    DATA lo_message_container TYPE REF TO /iwbep/if_message_container.


    lo_message_container = me->mo_context->get_message_container( ).

    io_data_provider->read_entry_data( IMPORTING es_data = wa_dp ).

    " SOC by FS_DEV3 on 24.09.2026 - DS4K907342 - reject HTML/script input (XSS audit)
    check_no_markup( is_header = wa_dp
                     it_items  = wa_dp-np_acc ).
    " EOC by FS_DEV3 on 24.09.2026

    wa_zfs_t_072-request_id = wa_dp-request_id.
    DATA(lv_stamp) = sy-datum && sy-uzeit.

    SELECT SINGLE request_id
    FROM zfs_t_072
    INTO @DATA(lv_req)
    WHERE request_id = @wa_zfs_t_072-request_id.

    IF lv_req IS INITIAL.
      LOOP AT wa_dp-np_acc INTO wa_np_acc.
        wa_np_acc-timestamp     = lv_stamp.
        wa_np_acc-zcreated_by   = sy-uname.
        wa_np_acc-zcreated_date = sy-datum.
        wa_np_acc-zcreated_time = sy-uzeit.
        CLEAR wa_np_acc-posting_status.
        APPEND wa_np_acc TO it_zfs_t_072.
      ENDLOOP.
    ENDIF.

    IF it_zfs_t_072 IS NOT INITIAL.

      INSERT zfs_t_072 FROM TABLE it_zfs_t_072.
*      COMMIT WORK AND WAIT.
      IF sy-subrc = 0.
        COMMIT WORK.
*        COMMIT WORK AND WAIT.

        wa_rep-request_id = wa_dp-request_id.
        wa_rep-remark3    = 'Success'.
        wa_rep-remark4    = 'Data Received Successfully'.

        ls_header-name = 'Response_Message' .
        ls_header-value = '{Msg_Type:S, Status: Data Inserted Successfully}'.
        /iwbep/if_mgw_conv_srv_runtime~set_header( ls_header ).

        CLEAR lv_jobname.
        CONCATENATE 'Beacon_Posting_' lv_stamp INTO lv_jobname.

        CALL FUNCTION 'JOB_OPEN'
          EXPORTING
            jobname          = lv_jobname
          IMPORTING
            jobcount         = lv_jobcount
          EXCEPTIONS
            cant_create_job  = 1
            invalid_job_data = 2
            OTHERS           = 3.

        IF sy-subrc = 0.

          SUBMIT zfs_fi_r044
            VIA JOB lv_jobname
            NUMBER lv_jobcount
            WITH p_stamp = lv_stamp
            WITH p_test = ''
          AND RETURN. " Optional: Return to the program after submitting

          CALL FUNCTION 'JOB_CLOSE'
            EXPORTING
              jobname              = lv_jobname
              jobcount             = lv_jobcount
              strtimmed            = 'X'  " Start immediately
            EXCEPTIONS
              cant_start_immediate = 1
              invalid_startdate    = 2
              jobname_missing      = 3
              job_close_failed     = 4
              OTHERS               = 5.

          IF sy-subrc = 0.
            WRITE: / 'Job submitted successfully.'.
          ELSE.
            WRITE: / 'Failed to start the job.'.
          ENDIF.
        ELSE.
          WRITE: / 'Failed to create the job.'.
        ENDIF.

        copy_data_to_ref( EXPORTING is_data = wa_rep
          CHANGING cr_data = er_deep_entity ).

      ENDIF.

    ELSE.

      ls_header-name = 'Response_Message'.
      IF lv_req IS NOT INITIAL.
        ls_header-value = '{Msg_Type:E, Status: Failed, request id already exists}'.
      ELSE.
        ls_header-value = '{Msg_Type:E, Status: Failed, No Data in Request}'.
      ENDIF.

      ls_header-name = '~status_code'.
      IF lv_req IS NOT INITIAL.
        ls_header-value = '{Msg_Type:E, Status: Failed, request id already exists}'.
      ELSE.
        ls_header-value = '{Msg_Type:E, Status: Failed, No Data in Request}'.
      ENDIF.

      /iwbep/if_mgw_conv_srv_runtime~set_header( ls_header ).

      wa_rep-request_id = wa_dp-request_id.
      wa_rep-remark3    = 'Failed'.
      wa_rep-remark4    = 'Request Id already exists'.

      copy_data_to_ref( EXPORTING is_data = wa_rep
        CHANGING cr_data = er_deep_entity ).
    ENDIF.

  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_expanded_entity.

    DATA : BEGIN OF deepstructure.
             INCLUDE TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_s_018_hd.
    DATA :   np_acc TYPE zcl_zfs_beacon_account_mpc=>tt_zfs_s_018_it,
           END OF deepstructure.

    DATA : wa_dp LIKE deepstructure.
    DATA : wa_np_acc TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_s_018_it.
    DATA : wa_zfs_t_072 TYPE zfs_t_072,
           it_zfs_t_072 TYPE STANDARD TABLE OF zfs_t_072.
    DATA : wa_key_tab TYPE /iwbep/s_mgw_name_value_pair.
    CONSTANTS : lc_expand TYPE string VALUE 'NP_ACC'.

    READ TABLE it_key_tab INTO wa_key_tab INDEX 1.
    IF sy-subrc = 0.
      DATA(ls_requestid) = wa_key_tab-value.
    ENDIF.

    SELECT * FROM zfs_t_072
      INTO TABLE it_zfs_t_072
      WHERE request_id = ls_requestid.

    READ TABLE it_zfs_t_072 INTO wa_zfs_t_072 INDEX 1.
    IF sy-subrc = 0.
      MOVE-CORRESPONDING wa_zfs_t_072 TO wa_dp.
    ENDIF.

    LOOP AT it_zfs_t_072 INTO wa_zfs_t_072.
      MOVE-CORRESPONDING wa_zfs_t_072 TO wa_np_acc.
      APPEND wa_np_acc TO wa_dp-np_acc.
      CLEAR : wa_np_acc, wa_zfs_t_072.
    ENDLOOP.

    copy_data_to_ref( EXPORTING is_data = wa_dp
                  CHANGING cr_data = er_entity ).

    INSERT lc_expand INTO TABLE et_expanded_tech_clauses.

  ENDMETHOD.


  METHOD zfs_t_091_itset_get_entityset.

    DATA: lt_filter TYPE /iwbep/t_mgw_select_option,
          ls_filter LIKE LINE OF lt_filter,
          ls_so     TYPE /iwbep/s_cod_select_option.

    lt_filter = io_tech_request_context->get_filter( )->get_filter_select_options( ).

    READ TABLE lt_filter WITH TABLE KEY property = 'REQUEST_ID' INTO ls_filter.
    IF sy-subrc IS INITIAL.
      LOOP AT ls_filter-select_options INTO ls_so.
        DATA(ls_requestid) = ls_so-low.
      ENDLOOP.
    ENDIF.

    DATA : it_dp TYPE zcl_zfs_beacon_account_mpc=>tt_zfs_t_091_it.
    DATA : wa_dp TYPE zcl_zfs_beacon_account_mpc=>ts_zfs_t_091_it.
*
    IF ls_requestid IS NOT INITIAL.
*
      SELECT * FROM zfs_t_091
        INTO CORRESPONDING FIELDS OF TABLE it_dp
        WHERE request_id = ls_requestid.
      IF it_dp IS INITIAL.
        SELECT * FROM zfs_t_072
          INTO TABLE @DATA(lt_072)
          WHERE request_id = @ls_requestid.
        IF lt_072 IS NOT INITIAL.
          wa_dp-request_id = ls_requestid.
          wa_dp-layer = 'SAP'.
          wa_dp-posting_status = 'Failed'.
          wa_dp-message = 'Background Job Failed/in Process'.
          APPEND wa_dp TO it_dp.
          CLEAR wa_dp.
        ELSE.
          wa_dp-request_id = ls_requestid.
          wa_dp-layer = 'Beacon'.
          wa_dp-posting_status = 'Failed'.
          CONCATENATE 'RequestId' ls_requestid 'does not exist' INTO wa_dp-message SEPARATED BY space.
          APPEND wa_dp TO it_dp.
          CLEAR wa_dp.
        ENDIF.
      ENDIF.

      et_entityset = it_dp.

    ENDIF.

  ENDMETHOD.


  METHOD check_no_markup.
* SOC by FS_DEV3 on 24.09.2026 - DS4K907342 - security audit: XSS input guard
*&---------------------------------------------------------------------*
* Method                   : CHECK_NO_MARKUP
* Technical Consultant     : FS_DEV3
* Date of Creation         : 24.09.2026
* Transport Request Number : DS4K907342
* Description              : Security audit fix (XSS). Walks every
*                            character-like component (C, STRING) of the
*                            header and of each NP_ACC line - DDIC
*                            includes flattened, so new ZFS_T_072 columns
*                            are covered automatically - and rejects the
*                            whole request if any of them contains < or >.
*                            Every offending field is reported with
*                            ZFS_TRM_MSG 055 (field name + position only;
*                            the caller's value is never echoed back).
*                            Raised as a business exception => HTTP 400.
*&---------------------------------------------------------------------*

    TYPES: BEGIN OF ty_row,
             position TYPE i,
             data     TYPE REF TO data,
           END OF ty_row.
    DATA lt_rows     TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    DATA lv_position TYPE i.
    DATA lv_rejected TYPE abap_bool.

    " Position 0 is the header, 1..n are the NP_ACC lines
    APPEND VALUE #( position = 0 data = REF #( is_header ) ) TO lt_rows.
    LOOP AT it_items ASSIGNING FIELD-SYMBOL(<ls_item>).
      lv_position = lv_position + 1.
      APPEND VALUE #( position = lv_position data = REF #( <ls_item> ) ) TO lt_rows.
    ENDLOOP.

    DATA(lo_container) = mo_context->get_message_container( ).

    LOOP AT lt_rows INTO DATA(ls_row).
      ASSIGN ls_row-data->* TO FIELD-SYMBOL(<ls_struct>).
      DATA(lo_struct) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( <ls_struct> ) ).

      " Only character-like fields can carry markup; tables, numbers and dates are skipped
      LOOP AT lo_struct->get_included_view( ) INTO DATA(ls_comp).
        IF ls_comp-type->type_kind <> cl_abap_typedescr=>typekind_char
       AND ls_comp-type->type_kind <> cl_abap_typedescr=>typekind_string.
          CONTINUE.
        ENDIF.
        ASSIGN COMPONENT ls_comp-name OF STRUCTURE <ls_struct> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc = 0 AND <lv_value> CA '<>'.
          " Only the technical field name and the position go back - never the caller's value.
          lo_container->add_message( iv_msg_type   = 'E'
                                     iv_msg_id     = 'ZFS_TRM_MSG'
                                     iv_msg_number = '055'
                                     iv_msg_v1     = CONV #( ls_comp-name )
                                     iv_msg_v2     = CONV #( |{ ls_row-position }| ) ).
          lv_rejected = abap_true.
        ENDIF.
      ENDLOOP.
    ENDLOOP.

    " Raise once, after all fields are checked, so the caller sees every bad field
    IF lv_rejected = abap_true.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_container = lo_container.
    ENDIF.

* EOC by FS_DEV3 on 24.09.2026 - DS4K907342
  ENDMETHOD.
ENDCLASS.