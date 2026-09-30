class ZCL_ZFS_BEACON_ACCO_01_DPC_EXT definition
  public
  inheriting from ZCL_ZFS_BEACON_ACCO_01_DPC
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
ENDCLASS.



CLASS ZCL_ZFS_BEACON_ACCO_01_DPC_EXT IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.


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
*            WITH p_stamp = lv_stamp      "Commented By Omkar K on 13.08.2026
            WITH p_reqid = wa_dp-request_id    "Added By Omkar K on 13.08.2026
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
                          CHANGING  cr_data = er_deep_entity ).

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
                        CHANGING  cr_data = er_deep_entity ).
    ENDIF.


  ENDMETHOD.


  method /IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_EXPANDED_ENTITY.

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


  endmethod.


  method ZFS_T_091_ITSET_GET_ENTITYSET.

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


  endmethod.
ENDCLASS.