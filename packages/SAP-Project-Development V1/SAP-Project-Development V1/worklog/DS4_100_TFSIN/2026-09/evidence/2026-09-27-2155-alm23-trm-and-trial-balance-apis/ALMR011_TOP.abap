*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR011_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr011.

TYPES: BEGIN OF ty_data,
         zgl_id    TYPE /fs00/almdt0042,
         zgl_desc  TYPE /fs00/almdt0043,
         zcal      TYPE /fs00/almdt0004,
         zcal_desc TYPE /fs00/almdt0005,
         zgr_id    TYPE /fs00/almdt0001,
         zgr_desc  TYPE /fs00/almdt0003,
         zbu_id    TYPE char2, "ZST_BUC,
         zbu_desc  TYPE /fs00/almdt0005,
         zgrp_id   TYPE /fs00/almdt0001,
         zgrp_name TYPE /fs00/almdt0003,
*       BU_ID TYPE char2,"ZDT_ST_BUC,
*       BU_DESC TYPE ZDT_DESC,
         ztype3    TYPE /fs00/almdt0046,
         zsns      TYPE /fs00/almdt0047,
       END OF ty_data.


DATA: gt_final TYPE TABLE OF /fs00/almtr018,
      gt_data  TYPE TABLE OF ty_data,
      gt_raw   TYPE truxs_t_text_data,
      gt_tr002 TYPE TABLE OF /fs00/almtr002.

DATA : gs_variant TYPE disvariant.

SELECTION-SCREEN : BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_file TYPE rlgrap-filename .
SELECTION-SCREEN : END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  PARAMETERS   p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b2.
