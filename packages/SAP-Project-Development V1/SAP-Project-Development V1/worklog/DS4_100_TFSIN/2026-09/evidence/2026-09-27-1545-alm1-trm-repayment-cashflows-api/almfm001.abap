FUNCTION /fs00/almfm001
  IMPORTING
    im_type TYPE char2 OPTIONAL
    im_date TYPE dats OPTIONAL
  EXPORTING
    ex_buck TYPE /fs00/almtt001.




  DATA: ls_buck TYPE /fs00/almst001,
        lv_days TYPE t5a4a-dlydy,
        lv_mon  TYPE t5a4a-dlymo,
        lv_year TYPE t5a4a-dlyyr,
        lv_date TYPE p0001-begda,
        lv_tab  TYPE tabname16.

  CASE im_type.
    WHEN '01'.
      SELECT  zbuc,
              zdesc,
              zxbrl,
              zfr_tp,
              zfr_no,
              zto_tp,
              zto_no
         FROM /fs00/almtr004
         INTO TABLE @DATA(lt_buck).
    WHEN OTHERS.
      SELECT  zbuc,
               zdesc,
               zxbrl,
               zfr_tp,
               zfr_no,
               zto_tp,
               zto_no
          FROM /fs00/almtr005
          INTO TABLE @lt_buck.
  ENDCASE.



  LOOP AT lt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>).
    ls_buck-zbuc = <fs_buck>-zbuc.
    ls_buck-zxbrl = <fs_buck>-zxbrl.

    "" From Details
    CLEAR:lv_days,lv_mon,lv_year,lv_date.
    CASE <fs_buck>-zfr_tp.
      WHEN '01'.
        lv_days = <fs_buck>-zfr_no.
      WHEN '02'.
        lv_mon = <fs_buck>-zfr_no.
      WHEN '03'.
        lv_year = <fs_buck>-zfr_no.
    ENDCASE.

    CALL FUNCTION 'RP_CALC_DATE_IN_INTERVAL'
      EXPORTING
        date      = im_date
        days      = lv_days
        months    = lv_mon
        signum    = '+'
        years     = lv_year
      IMPORTING
        calc_date = lv_date.
    ls_buck-zf_date = lv_date.
    IF lv_days IS NOT INITIAL.
      ls_buck-zf_date = ls_buck-zf_date - 1.
      ls_buck-zf_days = <fs_buck>-zfr_no.
    ELSE.
      ls_buck-zf_days = ls_buck-zf_date - im_date.
    ENDIF.


    "" To Details
    CLEAR:lv_days,lv_mon,lv_year,lv_date.
    CASE <fs_buck>-zto_tp.
      WHEN '01'.
        lv_days = <fs_buck>-zto_no.
      WHEN '02'.
        lv_mon = <fs_buck>-zto_no.
      WHEN '03'.
        lv_year = <fs_buck>-zto_no.
    ENDCASE.
    CLEAR:lv_date.
    CALL FUNCTION 'RP_CALC_DATE_IN_INTERVAL'
      EXPORTING
        date      = im_date
        days      = lv_days
        months    = lv_mon
        signum    = '+'
        years     = lv_year
      IMPORTING
        calc_date = lv_date.
    ls_buck-zt_date = lv_date - 1.

    IF <fs_buck>-zto_tp = '03' AND <fs_buck>-zto_no = '00'.
      ls_buck-zt_days = '99999'.
    ELSE.
      ls_buck-zt_days = ls_buck-zt_date - im_date + 1.
    ENDIF.


    APPEND ls_buck TO ex_buck.
    CLEAR:ls_buck.
  ENDLOOP.




ENDFUNCTION.