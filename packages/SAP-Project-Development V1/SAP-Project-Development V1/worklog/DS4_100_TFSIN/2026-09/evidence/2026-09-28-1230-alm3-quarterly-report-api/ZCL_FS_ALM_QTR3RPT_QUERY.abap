"! Query provider of ZFS_CE_AlmQtr3Report and ZFS_CE_AlmQtr3Period: /FS00/ALMR022 (Generate Quarterly
"! ALM3 Report, interest rate sensitivity) as an API. The feeder amounts are the ALM 2 report's
"! (ZCL_FS_ALM_QTR2RPT_QUERY get_items; /FS00/ALMR022 SUBMITs the same programs as /FS00/ALMR017).
"! Differs from the report where decided on 2026-09-28: TB for blank and source-99 groups on the ALM 3
"! group and the ALM 3 bucket (ZBU3_ID), a non-sensitive group's TB in bucket 11; a group's product and
"! transaction type lists select its amounts for every source; principal by the group's interest type,
"! investments and NCD only in fixed-rate groups; manual rows from ZFS_T_ALM3_MAN; level 6 rolled up
"! once; the cumulative rows total to their last bucket; a feeder without data gives zero, not a dump.
CLASS zcl_fs_alm_qtr3rpt_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_report TYPE STANDARD TABLE OF zfs_ce_almqtr3report WITH EMPTY KEY.

    "! All report rows of a period: the groups sorted by ID, then the computed rows; empty for an invalid period.
    METHODS get_report
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
      RETURNING VALUE(rt_report) TYPE tt_report.
    "! Saved snapshot and ALM 3 lock of a period.
    METHODS get_period
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
      RETURNING VALUE(rs_period) TYPE zfs_ce_almqtr3period.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_work.
        INCLUDE TYPE zfs_ce_almqtr3report.
    TYPES:
        "! Number of levels of the group ID in use (IA = 1, IA:06:00:00:00:00 = 2, ... up to 6).
        depth TYPE i,
      END OF ty_work,
      tt_work       TYPE STANDARD TABLE OF ty_work WITH EMPTY KEY,
      ty_amount     TYPE zfs_ce_almqtr3report-total,
      "! A comma-separated list of /FS00/ALMTR003 (products, transaction types) as a range.
      ty_list_value TYPE c LENGTH 20,
      tt_list_r     TYPE RANGE OF ty_list_value.

    CONSTANTS:
      c_bucket_count TYPE i VALUE 11,
      "! Bucket 11: non-sensitive amounts (the report's B11).
      c_nonsensitive TYPE i VALUE 11,
      BEGIN OF c_source,
        tb        TYPE /fs00/almdt0004 VALUE '99',
        manual    TYPE /fs00/almdt0004 VALUE '92',
        principal TYPE /fs00/almdt0004 VALUE '11',
        invest    TYPE /fs00/almdt0004 VALUE '09',
        ncd_from  TYPE /fs00/almdt0004 VALUE '13',
        ncd_to    TYPE /fs00/almdt0004 VALUE '19',
      END OF c_source,
      BEGIN OF c_int_type,
        fixed    TYPE /fs00/almdt0025 VALUE '01',
        floating TYPE /fs00/almdt0025 VALUE '02',
      END OF c_int_type,
      " IDs of the rows /FS00/ALMR022 computes (report row labels, not UI texts).
      BEGIN OF c_row,
        outflow      TYPE /fs00/almdt0001 VALUE 'IA:99:99:99:99:99',
        inflow       TYPE /fs00/almdt0001 VALUE 'IB:99:99:99:99:99',
        cum_outflow  TYPE /fs00/almdt0001 VALUE 'IA:99:99:99:99:99_A1',
        mismatch     TYPE /fs00/almdt0001 VALUE 'IC',
        cum_mismatch TYPE /fs00/almdt0001 VALUE 'ID',
        pct          TYPE /fs00/almdt0001 VALUE 'IE',
        cum_pct      TYPE /fs00/almdt0001 VALUE 'IF',
      END OF c_row.

    METHODS to_range
      IMPORTING iv_list         TYPE csequence
      RETURNING VALUE(rt_range) TYPE tt_list_r.
    METHODS put
      IMPORTING iv_bucket TYPE i
                iv_amount TYPE ty_amount
      CHANGING  cs_row    TYPE ty_work.
    METHODS get
      IMPORTING iv_bucket        TYPE i
                is_row           TYPE ty_work
      RETURNING VALUE(rv_amount) TYPE ty_amount.
    METHODS total
      CHANGING cs_row TYPE ty_work.
    "! Adds (or, with iv_sign = -1, subtracts) the buckets of is_from to cs_to.
    METHODS add
      IMPORTING is_from TYPE ty_work
                iv_sign TYPE i DEFAULT 1
      CHANGING  cs_to   TYPE ty_work.
    "! Adds to every parent of depth iv_depth its children of depth iv_depth + 1.
    METHODS roll_up
      IMPORTING iv_depth TYPE i
      CHANGING  ct_work  TYPE tt_work.
    METHODS sub_totals
      CHANGING ct_work TYPE tt_work.
    METHODS computed_rows
      CHANGING ct_work TYPE tt_work.
    METHODS apply_filter
      IMPORTING it_filter TYPE if_rap_query_filter=>tt_name_range_pairs
      CHANGING  ct_report TYPE tt_report.
ENDCLASS.



CLASS zcl_fs_alm_qtr3rpt_query IMPLEMENTATION.

  METHOD if_rap_query_provider~select.
    DATA: lv_bukrs  TYPE bukrs,
          lv_year   TYPE /fs00/almdt0032,
          lv_month  TYPE /fs00/almdt0031,
          lt_filter TYPE if_rap_query_filter=>tt_name_range_pairs.

    TRY.
        lt_filter = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range.
        " Not expressible as ranges: answer with no rows rather than with unfiltered data.
        CLEAR lt_filter.
        DATA(lv_unsupported) = abap_true.
    ENDTRY.

    IF io_request->get_entity_id( ) = 'ZFS_CE_ALMQTR3PERIOD'.
      " One period, addressed by its key (a GET by key arrives as three EQ ranges).
      DATA lt_period TYPE STANDARD TABLE OF zfs_ce_almqtr3period WITH EMPTY KEY.
      DATA(lv_keys) = 0.
      LOOP AT lt_filter INTO DATA(ls_key) WHERE name = 'COMPANYCODE' OR name = 'FISCALYEAR' OR name = 'FISCALPERIOD'.
        IF lines( ls_key-range ) = 1 AND ls_key-range[ 1 ]-sign = 'I' AND ls_key-range[ 1 ]-option = 'EQ'.
          lv_keys = lv_keys + 1.
          CASE ls_key-name.
            WHEN 'COMPANYCODE'.
              lv_bukrs = ls_key-range[ 1 ]-low.
            WHEN 'FISCALYEAR'.
              lv_year = ls_key-range[ 1 ]-low.
            WHEN 'FISCALPERIOD'.
              lv_month = ls_key-range[ 1 ]-low.
          ENDCASE.
        ENDIF.
      ENDLOOP.
      IF lv_unsupported = abap_false AND lv_keys = 3
         AND zcl_fs_alm_qtrrpt_query=>valid_period( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) = abap_true.
        APPEND get_period( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) TO lt_period.
      ENDIF.
      IF io_request->is_total_numb_of_rec_requested( ).
        io_response->set_total_number_of_records( lines( lt_period ) ).
      ENDIF.
      IF io_request->is_data_requested( ).
        io_request->get_paging( ).
        io_request->get_sort_elements( ).
        io_response->set_data( lt_period ).
      ENDIF.
      RETURN.
    ENDIF.

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

    DATA(lt_report) = COND tt_report( WHEN lv_unsupported = abap_false
                                      THEN get_report( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) ).
    apply_filter( EXPORTING it_filter = lt_filter CHANGING ct_report = lt_report ).

    DATA(lt_sort) = VALUE abap_sortorder_tab( FOR ls_sort IN io_request->get_sort_elements( )
                                              ( name = to_upper( ls_sort-element_name ) descending = ls_sort-descending ) ).
    IF lt_sort IS NOT INITIAL.
      SORT lt_report BY (lt_sort).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_report ) ).
    ENDIF.
    IF io_request->is_data_requested( ).
      DATA lt_page TYPE tt_report.
      DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
      DATA(lv_size)   = io_request->get_paging( )->get_page_size( ).
      LOOP AT lt_report INTO DATA(ls_row) FROM lv_offset + 1.
        IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( lt_page ) >= lv_size.
          EXIT.
        ENDIF.
        APPEND ls_row TO lt_page.
      ENDLOOP.
      io_response->set_data( lt_page ).
    ENDIF.
  ENDMETHOD.

  METHOD get_report.
    DATA: lt_work TYPE tt_work,
          ls_work TYPE ty_work,
          lt_item TYPE zcl_fs_alm_qtr2rpt_query=>tt_item,
          lt_bad  TYPE zcl_fs_alm_qtr2rpt_query=>tt_source_r.

    IF zcl_fs_alm_qtrrpt_query=>valid_period( iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month ) = abap_false.
      RETURN.
    ENDIF.
    DATA(lv_month_end) = zcl_fs_alm_qtrrpt_query=>last_day( iv_year = iv_year iv_month = iv_month ).

    " The feeders of /FS00/ALMR022 are /FS00/ALMR017's: one set of amounts per request.
    NEW zcl_fs_alm_qtr2rpt_query( )->get_items( EXPORTING iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month
                                                IMPORTING et_item  = lt_item  et_incomplete = lt_bad ).

    " Every ALM 3 report format group is a report row (the report selects them all as well).
    SELECT zgrp_id, zgrp_name, zsrc, zxbrl, zproduct, zttype, zint_type, zns, zint_split, zneg,
           zgrp2, zgrp3, zgrp4, zgrp5, zgrp6
      FROM /fs00/almtr003 INTO TABLE @DATA(lt_grp).   "#EC CI_NOWHERE
    SORT lt_grp BY zgrp_id.

    " Group-owned amounts: manual (ZFS_T_ALM3_MAN) and TB (accounts mapped to an ALM 3 group with source 99,
    " balance at the month end, ALM 3 bucket; a non-sensitive group takes them in bucket 11).
    SELECT grp_id, bucket, amount FROM zfs_t_alm3_man
      WHERE bukrs = @iv_bukrs AND zyear = @iv_year AND zmonth = @iv_month
      INTO TABLE @DATA(lt_manual).
    LOOP AT lt_manual INTO DATA(ls_manual).
      APPEND VALUE #( group_id = ls_manual-grp_id source = c_source-manual bucket = CONV i( ls_manual-bucket )
                      amount = CONV #( ls_manual-amount ) ) TO lt_item.
    ENDLOOP.
    SELECT zgl_id, zgrp_id, zbu3_id, ztype3 FROM /fs00/almtr018
      WHERE zcal = @c_source-tb AND zgl_id <> @space AND zgrp_id <> @space
      INTO TABLE @DATA(lt_map).
    IF lt_map IS NOT INITIAL.
      DATA lr_gl TYPE RANGE OF hkont.
      lr_gl = VALUE #( FOR m IN lt_map ( sign = 'I' option = 'EQ' low = m-zgl_id ) ).
      SELECT GLAccount, Balance
        FROM zfs_i_almglbalance( p_companycode = @iv_bukrs, p_keydate = @lv_month_end )
        WHERE GLAccount IN @lr_gl
        INTO TABLE @DATA(lt_balance).
      SORT lt_balance BY GLAccount.
      LOOP AT lt_map INTO DATA(ls_map).
        READ TABLE lt_balance INTO DATA(ls_balance) WITH KEY GLAccount = ls_map-zgl_id BINARY SEARCH.
        IF sy-subrc <> 0.
          CONTINUE.
        ENDIF.
        READ TABLE lt_grp INTO DATA(ls_owner) WITH KEY zgrp_id = ls_map-zgrp_id BINARY SEARCH.
        APPEND VALUE #( group_id = ls_map-zgrp_id
                        source   = c_source-tb
                        bucket   = COND i( WHEN sy-subrc = 0 AND ls_owner-zns IS NOT INITIAL THEN c_nonsensitive
                                           ELSE CONV i( ls_map-zbu3_id ) )
                        amount   = CONV #( ls_balance-Balance * COND i( WHEN ls_map-ztype3 = '02' THEN -1 ELSE 1 ) ) ) TO lt_item.
      ENDLOOP.
    ENDIF.

    LOOP AT lt_grp INTO DATA(ls_grp).
      CLEAR ls_work.
      ls_work-GroupId         = ls_grp-zgrp_id.
      ls_work-GroupName       = ls_grp-zgrp_name.
      ls_work-Source          = ls_grp-zsrc.
      ls_work-XbrlCode        = ls_grp-zxbrl.
      ls_work-Product         = ls_grp-zproduct.
      ls_work-TransactionType = ls_grp-zttype.
      ls_work-InterestType    = ls_grp-zint_type.
      ls_work-NonSensitive    = xsdbool( ls_grp-zns IS NOT INITIAL ).
      ls_work-InterestSplit   = xsdbool( ls_grp-zint_split IS NOT INITIAL ).
      ls_work-Negative        = xsdbool( ls_grp-zneg IS NOT INITIAL ).
      " Depth: the levels 2..6 in use, in order.
      ls_work-depth = 1.
      DATA(lt_level) = VALUE string_table( ( CONV #( ls_grp-zgrp2 ) ) ( CONV #( ls_grp-zgrp3 ) ) ( CONV #( ls_grp-zgrp4 ) )
                                           ( CONV #( ls_grp-zgrp5 ) ) ( CONV #( ls_grp-zgrp6 ) ) ).
      LOOP AT lt_level INTO DATA(lv_level).
        IF lv_level IS INITIAL OR lv_level = '00'.
          EXIT.
        ENDIF.
        ls_work-depth = ls_work-depth + 1.
      ENDLOOP.
      " Row styles as the report's colours (C300, C700, C100).
      IF ls_grp-zgrp_id+3(11) = '99:99:99:99'.
        ls_work-RowStyle = 'SUBTOTAL'.
      ELSEIF ls_grp-zgrp_id = 'IA' OR ls_grp-zgrp_id = 'IB'.
        ls_work-RowStyle = 'HEADING'.
      ENDIF.
      IF ls_grp-zgrp_id+6(8) = '00:00:00'.
        ls_work-RowStyle = 'LEVEL1'.
      ENDIF.

      CASE ls_grp-zsrc.
        WHEN space OR c_source-tb OR c_source-manual.
          " TB (a group without a source or with source 99; shown as 99 when an account is mapped) and manual amounts.
          DATA(lv_own) = COND /fs00/almdt0004( WHEN ls_grp-zsrc = c_source-manual THEN c_source-manual ELSE c_source-tb ).
          LOOP AT lt_item INTO DATA(ls_own) USING KEY group WHERE group_id = ls_grp-zgrp_id.
            IF ls_own-source <> lv_own.
              CONTINUE.
            ENDIF.
            ls_work-Source = ls_own-source.
            put( EXPORTING iv_bucket = ls_own-bucket iv_amount = ls_own-amount CHANGING cs_row = ls_work ).
          ENDLOOP.
        WHEN OTHERS.
          " Investments and NCD are fixed-rate only (decided 2026-09-28): nothing for a floating group; the
          " NCD rows of the report are the fixed-rate block (Grp4 = 01).
          IF ( ls_grp-zsrc = c_source-invest AND ls_grp-zint_type = c_int_type-floating )
             OR ( ls_grp-zsrc BETWEEN c_source-ncd_from AND c_source-ncd_to AND ls_grp-zgrp4 <> c_int_type-fixed ).
            ls_work-SourceIncomplete = xsdbool( lt_bad IS NOT INITIAL AND ls_grp-zsrc IN lt_bad ).
          ELSE.
            DATA(lr_product) = to_range( ls_grp-zproduct ).
            DATA(lr_trtype)  = to_range( ls_grp-zttype ).
            " Principal (source 11) also by the group's interest type (the report's FVAR = ZINT_TYPE).
            DATA(lv_int_type) = COND /fs00/almdt0025( WHEN ls_grp-zsrc = c_source-principal THEN ls_grp-zint_type ).
            LOOP AT lt_item INTO DATA(ls_item) USING KEY source WHERE source = ls_grp-zsrc.
              IF ls_item-group_id IS INITIAL AND ls_item-product IN lr_product AND ls_item-trtype IN lr_trtype
                 AND ( lv_int_type IS INITIAL OR ls_item-int_type = lv_int_type ).
                put( EXPORTING iv_bucket = ls_item-bucket iv_amount = ls_item-amount CHANGING cs_row = ls_work ).
              ENDIF.
            ENDLOOP.
            ls_work-SourceIncomplete = xsdbool( lt_bad IS NOT INITIAL AND ls_grp-zsrc IN lt_bad ).
          ENDIF.
      ENDCASE.

      " As the report: every bucket as an absolute amount before the totals.
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index }| OF STRUCTURE ls_work TO FIELD-SYMBOL(<lv_bucket>).
        <lv_bucket> = abs( <lv_bucket> ).
      ENDDO.
      total( CHANGING cs_row = ls_work ).
      APPEND ls_work TO lt_work.
    ENDLOOP.

    " As the report's LEVEL_TOTALS, deepest level first: 5 from 6, 4 from 5, 3 from 4, 2 from 3; a child
    " flagged negative is subtracted, a parent keeps its own amounts. Only direct children count, so a
    " level-6 row is not added to its level-4 grandparent a second time (the report's pass would).
    roll_up( EXPORTING iv_depth = 5 CHANGING ct_work = lt_work ).
    roll_up( EXPORTING iv_depth = 4 CHANGING ct_work = lt_work ).
    roll_up( EXPORTING iv_depth = 3 CHANGING ct_work = lt_work ).
    roll_up( EXPORTING iv_depth = 2 CHANGING ct_work = lt_work ).
    sub_totals( CHANGING ct_work = lt_work ).
    computed_rows( CHANGING ct_work = lt_work ).
    rt_report = CORRESPONDING #( lt_work ).
  ENDMETHOD.

  METHOD roll_up.
    " The rows are sorted by group ID, so a parent's children follow it and share its prefix
    " (IA:06: for depth 2, IA:06:01: for depth 3, ...): each parent reads forward until the prefix changes.
    DATA(lv_prefix) = 3 * iv_depth.
    LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_parent>) WHERE depth = iv_depth.
      DATA(lv_parent) = sy-tabix.
      LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_child>) FROM lv_parent + 1.
        IF <ls_child>-GroupId(lv_prefix) <> <ls_parent>-GroupId(lv_prefix).
          EXIT.
        ENDIF.
        IF <ls_child>-depth = iv_depth + 1.
          add( EXPORTING is_from = <ls_child> iv_sign = COND #( WHEN <ls_child>-Negative = abap_true THEN -1 ELSE 1 )
               CHANGING  cs_to   = <ls_parent> ).
        ENDIF.
      ENDLOOP.
      total( CHANGING cs_row = <ls_parent> ).
    ENDLOOP.
  ENDMETHOD.

  METHOD sub_totals.
    " xx:99:99:99:99:99 = sum of the xx:yy:00:00:00:00 rows of IA (outflows) and IB (inflows).
    LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_sub>) WHERE RowStyle = 'SUBTOTAL'.
      DATA(ls_sum) = VALUE ty_work( ).
      LOOP AT ct_work INTO DATA(ls_row) WHERE GroupId(2) = <ls_sub>-GroupId(2) AND GroupId+6(8) = '00:00:00'.
        add( EXPORTING is_from = ls_row CHANGING cs_to = ls_sum ).
      ENDLOOP.
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index }| OF STRUCTURE <ls_sub> TO FIELD-SYMBOL(<lv_sub>).
        <lv_sub> = get( iv_bucket = sy-index is_row = ls_sum ).
      ENDDO.
      total( CHANGING cs_row = <ls_sub> ).
    ENDLOOP.
  ENDMETHOD.

  METHOD computed_rows.
    DATA(ls_out) = VALUE #( ct_work[ GroupId = c_row-outflow ] OPTIONAL ).
    DATA(ls_in)  = VALUE #( ct_work[ GroupId = c_row-inflow ] OPTIONAL ).
    IF ls_out-GroupId IS INITIAL OR ls_in-GroupId IS INITIAL.
      RETURN.
    ENDIF.

    " The report's rows over all 11 buckets (bucket 11 included, decided 2026-09-28).
    DATA(ls_cum_out) = VALUE ty_work( GroupId = c_row-cum_outflow GroupName = 'Cumulative Outflows'
                                      XbrlCode = 'Y1230' RowStyle = 'CUMULATIVE' ) ##NO_TEXT.
    DATA(ls_mismatch) = VALUE ty_work( GroupId = c_row-mismatch GroupName = 'C. Mismatch (IB-IA)'
                                       XbrlCode = 'Y1770' RowStyle = 'MISMATCH' ) ##NO_TEXT.
    DATA(ls_cum_mismatch) = VALUE ty_work( GroupId = c_row-cum_mismatch GroupName = 'D. Cumulative mismatch'
                                           XbrlCode = 'Y1780' RowStyle = 'CUMULATIVE' ) ##NO_TEXT.
    DATA(ls_pct) = VALUE ty_work( GroupId = c_row-pct GroupName = 'E. Mismatch as % of Total Outflows'
                                  XbrlCode = 'Y1790' RowStyle = 'PERCENT' ) ##NO_TEXT.
    DATA(ls_cum_pct) = VALUE ty_work( GroupId = c_row-cum_pct
                                      GroupName = 'F. Cumulative Mismatch as % of Cumulative Total Outflows'
                                      XbrlCode = 'Y1800' RowStyle = 'PERCENT' ) ##NO_TEXT.

    DATA lv_cum_out      TYPE ty_amount.
    DATA lv_cum_mismatch TYPE ty_amount.
    DO c_bucket_count TIMES.
      DATA(lv_out)      = get( iv_bucket = sy-index is_row = ls_out ).
      DATA(lv_mismatch) = CONV ty_amount( get( iv_bucket = sy-index is_row = ls_in ) - lv_out ).
      lv_cum_out      = lv_cum_out + lv_out.
      lv_cum_mismatch = lv_cum_mismatch + lv_mismatch.
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_cum_out      CHANGING cs_row = ls_cum_out ).
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_mismatch     CHANGING cs_row = ls_mismatch ).
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_cum_mismatch CHANGING cs_row = ls_cum_mismatch ).
      IF lv_out > 0.
        put( EXPORTING iv_bucket = sy-index iv_amount = CONV #( lv_mismatch / lv_out * 100 ) CHANGING cs_row = ls_pct ).
      ENDIF.
      IF lv_cum_out > 0.
        put( EXPORTING iv_bucket = sy-index iv_amount = CONV #( lv_cum_mismatch / lv_cum_out * 100 ) CHANGING cs_row = ls_cum_pct ).
      ENDIF.
    ENDDO.
    " Cumulative rows total to their last bucket (the report summed the cumulative values).
    ls_cum_out-Total      = lv_cum_out.
    total( CHANGING cs_row = ls_mismatch ).
    ls_cum_mismatch-Total = lv_cum_mismatch.
    " As the report: (IB - IA) / IA rounded to four places, as a percentage; IF has no total.
    IF ls_out-Total > 0.
      ls_pct-Total = round( val = ( ls_in-Total - ls_out-Total ) / ls_out-Total dec = 4 ) * 100.
    ENDIF.

    APPEND: ls_cum_out TO ct_work, ls_mismatch TO ct_work, ls_cum_mismatch TO ct_work, ls_pct TO ct_work, ls_cum_pct TO ct_work.
  ENDMETHOD.

  METHOD get_period.
    DATA(lv_last) = zcl_fs_alm_qtrrpt_query=>last_day( iv_year = iv_year iv_month = iv_month ).
    rs_period = VALUE #( CompanyCode = iv_bukrs FiscalYear = iv_year FiscalPeriod = iv_month KeyDate = lv_last + 1 ).

    SELECT zcreated_by, zcreated_date FROM /fs00/almtr016
      WHERE zbukrs = @iv_bukrs AND zmonth = @iv_month AND zyear = @iv_year
      ORDER BY zcreated_date, zcreated_time
      INTO TABLE @DATA(lt_saved).
    IF lt_saved IS NOT INITIAL.
      rs_period-Saved     = abap_true.
      rs_period-SavedRows = lines( lt_saved ).
      rs_period-SavedBy   = lt_saved[ 1 ]-zcreated_by.
      rs_period-SavedOn   = lt_saved[ 1 ]-zcreated_date.
    ENDIF.

    " The ALM 3 period lock (/FS00/ALMDM0006 value 03).
    SELECT SINGLE zcreated_by, zcreated_date FROM /fs00/almtr012
      WHERE zbukrs = @iv_bukrs AND zsource = '03' AND zdate = @lv_last AND zlock = 'X'
      INTO @DATA(ls_lock).
    IF sy-subrc = 0.
      rs_period-Locked   = abap_true.
      rs_period-LockedBy = ls_lock-zcreated_by.
      rs_period-LockedOn = ls_lock-zcreated_date.
    ENDIF.
  ENDMETHOD.

  METHOD to_range.
    SPLIT iv_list AT ',' INTO TABLE DATA(lt_value).
    LOOP AT lt_value INTO DATA(lv_value).
      CONDENSE lv_value.
      IF lv_value IS NOT INITIAL.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_value ) TO rt_range.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD put.
    ASSIGN COMPONENT |BUCKET{ iv_bucket }| OF STRUCTURE cs_row TO FIELD-SYMBOL(<lv_amount>).
    IF sy-subrc = 0.
      <lv_amount> = <lv_amount> + iv_amount.
    ENDIF.
  ENDMETHOD.

  METHOD get.
    ASSIGN COMPONENT |BUCKET{ iv_bucket }| OF STRUCTURE is_row TO FIELD-SYMBOL(<lv_amount>).
    IF sy-subrc = 0.
      rv_amount = <lv_amount>.
    ENDIF.
  ENDMETHOD.

  METHOD total.
    cs_row-Total = cs_row-Bucket1 + cs_row-Bucket2 + cs_row-Bucket3 + cs_row-Bucket4 + cs_row-Bucket5 + cs_row-Bucket6
                 + cs_row-Bucket7 + cs_row-Bucket8 + cs_row-Bucket9 + cs_row-Bucket10 + cs_row-Bucket11.
  ENDMETHOD.

  METHOD add.
    DO c_bucket_count TIMES.
      put( EXPORTING iv_bucket = sy-index iv_amount = iv_sign * get( iv_bucket = sy-index is_row = is_from )
           CHANGING  cs_row    = cs_to ).
    ENDDO.
    total( CHANGING cs_row = cs_to ).
  ENDMETHOD.

  METHOD apply_filter.
    LOOP AT it_filter INTO DATA(ls_filter).
      LOOP AT ct_report ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_filter-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc = 0 AND <lv_value> NOT IN ls_filter-range.
          DELETE ct_report.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
