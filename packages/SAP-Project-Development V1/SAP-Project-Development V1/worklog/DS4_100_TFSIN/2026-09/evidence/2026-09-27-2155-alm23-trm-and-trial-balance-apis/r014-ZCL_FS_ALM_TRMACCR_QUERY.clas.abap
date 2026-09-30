"! Query provider of ZFS_CE_AlmTrmAccrual: /FS00/ALMR014 (TRM accrual cash flows, ALM 2/3) as an API.
"! Business rules as the report: the accrual of a deal is the FL41 valuation amount of the referenced
"! deal on the month end (10F, transaction type 202), FL52 - FL51 posted up to the month end (other 10F)
"! or the FL42 amount of the first posting date after the month end (other products), all in valuation
"! area 001; the accrual of a security is FL52 - FL51 posted up to the month end in valuation area 002.
"! The whole amount goes to the ALM 2/3 bucket of the next interest payout (FL11) posted after the month
"! end; without one there is no row. Reversed flows (booking state 4) and product type 10E are ignored.
"! Technical defects of the report fixed: a security is listed once, not also from its deal (D6); Total
"! includes bucket 10 (D7); no never-filled source columns (D8); no unit conversion here, so no overflow
"! handling that clears the wrong bucket (D20). Also: a deal is listed once, all flows of a security
"! count, and filters never cut the flows of a referenced deal.
CLASS zcl_fs_alm_trmaccr_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_result TYPE STANDARD TABLE OF zfs_ce_almtrmaccrual WITH EMPTY KEY.

  PRIVATE SECTION.
    TYPES:
      ty_amount       TYPE zfs_ce_almtrmaccrual-total,
      tt_deal_range   TYPE RANGE OF tb_rfha,
      tt_sec_range    TYPE RANGE OF vvranlw,
      tt_prod_range   TYPE RANGE OF vvsart,
      BEGIN OF ty_candidate,
        bukrs    TYPE /fs00/cds0001-bukrs,
        rfha     TYPE /fs00/cds0001-rfha,
        ranl     TYPE /fs00/cds0001-ranl,
        activity TYPE /fs00/cds0001-activity,
        sgsart   TYPE /fs00/cds0001-sgsart,
        ltx      TYPE /fs00/cds0001-ltx,
        sfhaart  TYPE /fs00/cds0001-sfhaart,
        xtext    TYPE /fs00/cds0001-xtext,
        kontrh   TYPE /fs00/cds0001-kontrh,
        bp_name  TYPE /fs00/cds0001-bp_name,
        dblfz    TYPE /fs00/cds0001-dblfz,
        delfz    TYPE /fs00/cds0001-delfz,
        nordext  TYPE /fs00/cds0001-nordext,
      END OF ty_candidate,
      tt_candidate TYPE STANDARD TABLE OF ty_candidate WITH EMPTY KEY,
      "! An amount per deal number or security ID.
      BEGIN OF ty_amount_of,
        id     TYPE tb_rfha,
        amount TYPE ty_amount,
      END OF ty_amount_of,
      tt_amount_of TYPE HASHED TABLE OF ty_amount_of WITH UNIQUE KEY id,
      "! A date per deal number or security ID.
      BEGIN OF ty_date_of,
        id   TYPE tb_rfha,
        date TYPE d,
      END OF ty_date_of,
      tt_date_of TYPE HASHED TABLE OF ty_date_of WITH UNIQUE KEY id,
      BEGIN OF ty_flows,
        net_deal       TYPE tt_amount_of,
        net_security   TYPE tt_amount_of,
        fl41           TYPE tt_amount_of,
        fl42           TYPE tt_amount_of,
        payout_deal    TYPE tt_date_of,
        payout_security TYPE tt_date_of,
      END OF ty_flows,
      BEGIN OF ty_bucket,
        bucket    TYPE /fs00/almst001-zbuc,
        from_days TYPE i,
        to_days   TYPE i,
      END OF ty_bucket,
      "! Ten rows in bucket order, searched by day range.
      tt_bucket TYPE STANDARD TABLE OF ty_bucket WITH EMPTY KEY.

    CONSTANTS:
      BEGIN OF c_valuation_area,
        deal     TYPE tpm_val_area VALUE '001',
        security TYPE tpm_val_area VALUE '002',
      END OF c_valuation_area.

    DATA mv_bukrs     TYPE bukrs.
    DATA mv_month_end TYPE d.
    DATA mt_bucket    TYPE tt_bucket.
    DATA ms_flow      TYPE ty_flows.

    METHODS build
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
                it_filter        TYPE if_rap_query_filter=>tt_name_range_pairs
      RETURNING VALUE(rt_result) TYPE tt_result.
    "! Last day of the month; initial for an invalid year or month.
    METHODS month_end
      IMPORTING iv_year        TYPE /fs00/almdt0032
                iv_month       TYPE /fs00/almdt0031
      RETURNING VALUE(rv_date) TYPE d.
    "! The ten ALM 2/3 buckets (/FS00/ALMFM001 type 02) in days from the month end.
    METHODS read_buckets.
    "! Money-market deals started by the month end and securities, one entry each.
    METHODS read_candidates
      IMPORTING it_filter           TYPE if_rap_query_filter=>tt_name_range_pairs
      RETURNING VALUE(rt_candidate) TYPE tt_candidate.
    "! Flow sums of the company code, aggregated in the database.
    METHODS read_flows.
    METHODS read_net_positions.
    METHODS read_accruals.
    METHODS read_payouts.
    METHODS accrual
      IMPORTING is_candidate     TYPE ty_candidate
      RETURNING VALUE(rv_amount) TYPE ty_amount.
    METHODS payout_date
      IMPORTING is_candidate   TYPE ty_candidate
      RETURNING VALUE(rv_date) TYPE d.
    METHODS bucket_of
      IMPORTING iv_days          TYPE i
      RETURNING VALUE(rv_bucket) TYPE ty_bucket-bucket.
    "! The row of a deal or security; initial when nothing is accrued or it cannot be placed.
    METHODS to_row
      IMPORTING is_candidate  TYPE ty_candidate
      RETURNING VALUE(rs_row) TYPE zfs_ce_almtrmaccrual.
    METHODS range_of
      IMPORTING it_filter       TYPE if_rap_query_filter=>tt_name_range_pairs
                iv_name         TYPE string
      RETURNING VALUE(rt_range) TYPE if_rap_query_filter=>tt_range_option.
    "! $filter on any element; the ranges come from the request.
    METHODS apply_filter
      IMPORTING it_filter TYPE if_rap_query_filter=>tt_name_range_pairs
      CHANGING  ct_result TYPE tt_result.
ENDCLASS.



CLASS zcl_fs_alm_trmaccr_query IMPLEMENTATION.

  METHOD if_rap_query_provider~select.
    DATA lv_bukrs  TYPE bukrs.
    DATA lv_year   TYPE /fs00/almdt0032.
    DATA lv_month  TYPE /fs00/almdt0031.
    DATA lt_result TYPE tt_result.

    LOOP AT io_request->get_parameters( ) INTO DATA(ls_param).
      CASE ls_param-parameter_name.
        WHEN 'P_COMPANYCODE'.
          lv_bukrs = ls_param-value.
        WHEN 'P_FISCALYEAR'.
          lv_year = ls_param-value.
        WHEN 'P_FISCALPERIOD'.
          lv_month = ls_param-value.
      ENDCASE.
    ENDLOOP.

    TRY.
        DATA(lt_filter) = io_request->get_filter( )->get_as_ranges( ).
        lt_result = build( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month it_filter = lt_filter ).
        apply_filter( EXPORTING it_filter = lt_filter CHANGING ct_result = lt_result ).
      CATCH cx_rap_query_filter_no_range.
        " A filter that is not expressible as ranges (e.g. OR across two elements) is not
        " supported: answer with no rows rather than with unfiltered data.
        CLEAR lt_result.
    ENDTRY.

    DATA(lt_sort) = VALUE abap_sortorder_tab( FOR ls_sort IN io_request->get_sort_elements( )
                                              ( name       = to_upper( ls_sort-element_name )
                                                descending = ls_sort-descending ) ).
    IF lt_sort IS INITIAL.
      lt_sort = VALUE #( ( name = 'COMPANYCODE' ) ( name = 'DEALNUMBER' ) ( name = 'SECURITYID' ) ) ##NO_TEXT.
    ENDIF.
    SORT lt_result BY (lt_sort).

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_result ) ).
    ENDIF.
    IF io_request->is_data_requested( ).
      DATA(lv_from) = CONV i( io_request->get_paging( )->get_offset( ) + 1 ).
      DATA(lv_size) = io_request->get_paging( )->get_page_size( ).
      DATA(lv_to)   = COND i( WHEN lv_size = if_rap_query_paging=>page_size_unlimited THEN lines( lt_result )
                              ELSE lv_from + lv_size - 1 ).
      io_response->set_data( VALUE tt_result( FOR ls_row IN lt_result FROM lv_from TO lv_to ( ls_row ) ) ).
    ENDIF.
  ENDMETHOD.

  METHOD build.
    mv_bukrs     = iv_bukrs.
    mv_month_end = month_end( iv_year = iv_year iv_month = iv_month ).
    IF mv_bukrs IS INITIAL OR mv_month_end IS INITIAL.
      RETURN.
    ENDIF.

    DATA(lt_candidate) = read_candidates( it_filter ).
    IF lt_candidate IS INITIAL.
      RETURN.
    ENDIF.
    read_buckets( ).
    read_flows( ).

    rt_result = VALUE #( FOR ls_candidate IN lt_candidate ( to_row( ls_candidate ) ) ).
    " As the report: a row without an amount is not shown.
    DELETE rt_result WHERE Total = 0.
  ENDMETHOD.

  METHOD month_end.
    IF iv_year IS INITIAL OR iv_month < 1 OR iv_month > 12.
      RETURN.
    ENDIF.
    DATA(lv_next_month) = CONV d( CONV d( |{ iv_year }{ iv_month }01| ) + 31 ).
    rv_date = CONV d( |{ lv_next_month(6) }01| ) - 1.
  ENDMETHOD.

  METHOD read_buckets.
    DATA lt_buck TYPE /fs00/almtt001.

    " As the report: the buckets start on the day after the month end.
    DATA(lv_key_date) = CONV dats( mv_month_end + 1 ).
    CALL FUNCTION '/FS00/ALMFM001'
      EXPORTING
        im_type = '02'
        im_date = lv_key_date
      IMPORTING
        ex_buck = lt_buck.

    " Adjacent buckets share their limit day; as the report, the lower bucket wins.
    mt_bucket = VALUE #( FOR ls_buck IN lt_buck
                         ( bucket = ls_buck-zbuc from_days = ls_buck-zf_days to_days = ls_buck-zt_days ) ).
    SORT mt_bucket BY bucket.
  ENDMETHOD.

  METHOD read_candidates.
    DATA(lr_deal)     = CORRESPONDING tt_deal_range( range_of( it_filter = it_filter iv_name = `DEALNUMBER` ) ).
    DATA(lr_security) = CORRESPONDING tt_sec_range( range_of( it_filter = it_filter iv_name = `SECURITYID` ) ).
    DATA(lr_product)  = CORRESPONDING tt_prod_range( range_of( it_filter = it_filter iv_name = `PRODUCTTYPE` ) ).

    SELECT DISTINCT bukrs, rfha, ranl, activity, sgsart, ltx, sfhaart, xtext, kontrh, bp_name, dblfz, delfz, nordext
      FROM /fs00/cds0001
      WHERE bukrs   = @mv_bukrs
        AND sgsart <> '10E'
        AND sgsart IN @lr_product
        AND ( ( ranl = @space AND dblfz <= @mv_month_end AND rfha IN @lr_deal )
           OR ( ranl <> @space AND ranl IN @lr_security ) )
      INTO TABLE @rt_candidate.

    " One entry per deal (the view can repeat a deal) and one per security: a security bought
    " through a deal is the security, listed once with the attributes of its first deal (D6).
    SORT rt_candidate BY ranl rfha.
    MODIFY rt_candidate FROM VALUE #( ) TRANSPORTING rfha WHERE ranl IS NOT INITIAL.
    DELETE ADJACENT DUPLICATES FROM rt_candidate COMPARING ranl rfha.
  ENDMETHOD.

  METHOD read_flows.
    CLEAR ms_flow.
    read_net_positions( ).
    read_accruals( ).
    read_payouts( ).
  ENDMETHOD.

  METHOD read_net_positions.
    " FL52 - FL51 posted up to the month end: deals in valuation area 001, securities in 002.
    SELECT valuation_area, deal_number, security_id, zfs_flow, SUM( position_amt ) AS amount
      FROM /fs00/cds0002
      WHERE company_code    = @mv_bukrs
        AND booking_state  <> '4'
        AND valuation_area IN ( @c_valuation_area-deal, @c_valuation_area-security )
        AND zfs_flow       IN ( 'FL51', 'FL52' )
        AND fi_post_date   <= @mv_month_end
      GROUP BY valuation_area, deal_number, security_id, zfs_flow
      INTO TABLE @DATA(lt_net).

    LOOP AT lt_net INTO DATA(ls_net).
      DATA(lv_amount) = COND ty_amount( WHEN ls_net-zfs_flow = 'FL52' THEN ls_net-amount ELSE ls_net-amount * -1 ).
      IF ls_net-valuation_area = c_valuation_area-deal AND ls_net-deal_number IS NOT INITIAL.
        COLLECT VALUE ty_amount_of( id = ls_net-deal_number amount = lv_amount ) INTO ms_flow-net_deal.
      ELSEIF ls_net-valuation_area = c_valuation_area-security AND ls_net-security_id IS NOT INITIAL.
        COLLECT VALUE ty_amount_of( id = ls_net-security_id amount = lv_amount ) INTO ms_flow-net_security.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_accruals.
    " 10F deals of transaction type 202: FL41 valuation amount posted on the month end.
    SELECT deal_number AS id, SUM( valuation_amt ) AS amount
      FROM /fs00/cds0002
      WHERE company_code   = @mv_bukrs
        AND booking_state <> '4'
        AND valuation_area = @c_valuation_area-deal
        AND zfs_flow       = 'FL41'
        AND fi_post_date   = @mv_month_end
        AND deal_number   <> @space
      GROUP BY deal_number
      INTO CORRESPONDING FIELDS OF TABLE @ms_flow-fl41.

    " Other deals: FL42 (the accrual reversal) of the first posting date after the month end.
    SELECT deal_number AS id, fi_post_date, SUM( position_amt ) AS amount
      FROM /fs00/cds0002
      WHERE company_code   = @mv_bukrs
        AND booking_state <> '4'
        AND valuation_area = @c_valuation_area-deal
        AND zfs_flow       = 'FL42'
        AND fi_post_date   > @mv_month_end
        AND deal_number   <> @space
      GROUP BY deal_number, fi_post_date
      INTO TABLE @DATA(lt_fl42).

    SORT lt_fl42 BY id fi_post_date.
    DELETE ADJACENT DUPLICATES FROM lt_fl42 COMPARING id.
    ms_flow-fl42 = CORRESPONDING #( lt_fl42 ).
  ENDMETHOD.

  METHOD read_payouts.
    " Next interest payout: the earliest FL11 due after the month end among those posted after it.
    SELECT valuation_area, deal_number, security_id, MIN( trldate ) AS payout
      FROM /fs00/cds0002
      WHERE company_code    = @mv_bukrs
        AND booking_state  <> '4'
        AND valuation_area IN ( @c_valuation_area-deal, @c_valuation_area-security )
        AND zfs_flow        = 'FL11'
        AND fi_post_date    > @mv_month_end
        AND trldate         > @mv_month_end
      GROUP BY valuation_area, deal_number, security_id
      INTO TABLE @DATA(lt_payout).

    " Earliest first, so that the first insert per deal or security is kept.
    SORT lt_payout BY payout.
    LOOP AT lt_payout INTO DATA(ls_payout).
      IF ls_payout-valuation_area = c_valuation_area-deal AND ls_payout-deal_number IS NOT INITIAL.
        INSERT VALUE #( id = ls_payout-deal_number date = ls_payout-payout ) INTO TABLE ms_flow-payout_deal.
      ELSEIF ls_payout-valuation_area = c_valuation_area-security AND ls_payout-security_id IS NOT INITIAL.
        INSERT VALUE #( id = ls_payout-security_id date = ls_payout-payout ) INTO TABLE ms_flow-payout_security.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD accrual.
    IF is_candidate-ranl IS NOT INITIAL.
      rv_amount = VALUE #( ms_flow-net_security[ id = is_candidate-ranl ]-amount OPTIONAL ).
    ELSEIF is_candidate-sgsart <> '10F'.
      rv_amount = VALUE #( ms_flow-fl42[ id = is_candidate-rfha ]-amount OPTIONAL ).
    ELSEIF is_candidate-sfhaart = '202'.
      " The accrual of the deal referenced by the external number (as the report).
      DATA(lv_reference) = CONV tb_rfha( is_candidate-nordext ).
      lv_reference = |{ lv_reference ALPHA = IN }|.
      rv_amount = VALUE #( ms_flow-fl41[ id = lv_reference ]-amount OPTIONAL ).
    ELSE.
      rv_amount = VALUE #( ms_flow-net_deal[ id = is_candidate-rfha ]-amount OPTIONAL ).
    ENDIF.
  ENDMETHOD.

  METHOD payout_date.
    IF is_candidate-ranl IS NOT INITIAL.
      rv_date = VALUE #( ms_flow-payout_security[ id = is_candidate-ranl ]-date OPTIONAL ).
    ELSE.
      rv_date = VALUE #( ms_flow-payout_deal[ id = is_candidate-rfha ]-date OPTIONAL ).
    ENDIF.
  ENDMETHOD.

  METHOD bucket_of.
    LOOP AT mt_bucket INTO DATA(ls_bucket) WHERE from_days <= iv_days AND to_days >= iv_days.
      rv_bucket = ls_bucket-bucket.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD to_row.
    DATA(lv_amount) = accrual( is_candidate ).
    DATA(lv_payout) = payout_date( is_candidate ).
    IF lv_amount = 0 OR lv_payout IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lv_bucket) = bucket_of( lv_payout - mv_month_end ).
    IF lv_bucket IS INITIAL.
      RETURN.
    ENDIF.

    rs_row = VALUE #( CompanyCode         = is_candidate-bukrs
                      DealNumber          = is_candidate-rfha
                      SecurityId          = is_candidate-ranl
                      Activity            = is_candidate-activity
                      ProductType         = is_candidate-sgsart
                      ProductTypeText     = is_candidate-ltx
                      TransactionType     = is_candidate-sfhaart
                      TransactionTypeText = is_candidate-xtext
                      Customer            = is_candidate-kontrh
                      CustomerName        = shift_left( val = is_candidate-bp_name sub = '0' )
                      StartDate           = is_candidate-dblfz
                      EndDate             = is_candidate-delfz
                      InterestPayoutDate  = lv_payout
                      Total               = lv_amount ).

    ASSIGN COMPONENT |BUCKET{ lv_bucket }| OF STRUCTURE rs_row TO FIELD-SYMBOL(<lv_bucket>).
    IF sy-subrc = 0.
      <lv_bucket> = lv_amount.
    ELSE.
      CLEAR rs_row.
    ENDIF.
  ENDMETHOD.

  METHOD range_of.
    rt_range = VALUE #( it_filter[ name = iv_name ]-range OPTIONAL ).
  ENDMETHOD.

  METHOD apply_filter.
    LOOP AT it_filter INTO DATA(ls_filter).
      LOOP AT ct_result ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_filter-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc = 0 AND <lv_value> NOT IN ls_filter-range.
          DELETE ct_result.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
