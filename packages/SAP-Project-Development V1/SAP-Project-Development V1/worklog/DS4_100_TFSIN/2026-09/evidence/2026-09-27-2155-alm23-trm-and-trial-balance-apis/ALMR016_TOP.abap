*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR016_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr016.

TYPES : BEGIN OF ty_display,
          gl_id        TYPE saknr,
          gl_desc      TYPE txt50_skat,
          gr_id        TYPE /fs00/almdt0033,
          gr_desc      TYPE char120,
          cal_id       TYPE /fs00/almdt0004,
          cal_desc     TYPE /fs00/almdt0005,
          bu_id        TYPE /fs00/almdt0044,
          bu_desc      TYPE char30,
          type         TYPE /fs00/almdt0046,
          alm3_grp     TYPE /fs00/almdt0033,
          alm3_grpdesc TYPE char120,
        END OF ty_display.

DATA : gt_display TYPE TABLE OF ty_display,
       gs_display LIKE LINE OF gt_display.

DATA : gt_data TYPE TABLE OF /fs00/almtr018,
       gs_data TYPE /fs00/almtr018.

DATA :gt_grid TYPE REF TO cl_gui_alv_grid.
DATA : is_valid.
DATA : gt_data1 TYPE TABLE OF /fs00/almtr018,
       gs_data1 LIKE LINE OF gt_data1.

DATA : gt_skat TYPE TABLE OF skat,
       gs_skat LIKE LINE OF gt_skat.

DATA : gt_bkt TYPE TABLE OF /fs00/almtr005,
       gs_bkt TYPE /fs00/almtr005.

DATA : gt_grp  TYPE TABLE OF /fs00/almtr002,
       gs_grp  LIKE LINE OF gt_grp,
       gt_grp3 TYPE TABLE OF /fs00/almtr003,
       gs_grp3 LIKE LINE OF gt_grp3.

DATA : gt_src TYPE TABLE OF /fs00/almtr008,
       gs_src LIKE LINE OF gt_src.

DATA : gt_fcat    TYPE lvc_t_fcat,
       gs_layout  TYPE lvc_s_layo,
       gs_variant TYPE disvariant.

DATA : heading TYPE slis_t_listheader.
DATA : t_sort  TYPE slis_t_sortinfo_alv,
       gs_sort TYPE slis_sortinfo_alv.
SELECTION-SCREEN : BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
*              p_month TYPE month OBLIGATORY,
*              p_year  TYPE /fs00/almdt0032 OBLIGATORY.
SELECTION-SCREEN : END OF BLOCK b1.
