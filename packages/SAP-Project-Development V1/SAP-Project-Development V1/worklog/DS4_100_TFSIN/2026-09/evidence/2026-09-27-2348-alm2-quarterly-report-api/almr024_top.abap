*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR024_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr024.

TYPES : BEGIN OF ty_data,
          mark TYPE c.
          INCLUDE TYPE /fs00/almtr027.
TYPES: END OF ty_data.

DATA: gt_data  TYPE TABLE OF /fs00/almtr028,
      gt_tr008 TYPE TABLE OF /fs00/almtr008,
      gt_tr027 TYPE TABLE OF /fs00/almtr027,
      gt_fltc  TYPE TABLE OF ty_data,
      gs_fltc  LIKE LINE OF gt_fltc,
      gt_skat  TYPE TABLE OF skat.
DATA : gt_gld TYPE REF TO data,
       gt_gl  TYPE TABLE OF fagl_s_rfssld00_list.
FIELD-SYMBOLS: <fs_dat> TYPE ANY TABLE.

DATA: gv_amt_div TYPE i.
DATA: gr_src  TYPE RANGE OF /fs00/almdt0004.
DATA : gt_fcat    TYPE lvc_t_fcat,
       gs_layout  TYPE lvc_s_layo,
       gs_variant TYPE disvariant.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
              p_month TYPE n LENGTH 2 OBLIGATORY,
              p_year  TYPE n LENGTH 4 OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN : BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS: rb1 RADIOBUTTON GROUP amt,
              rb2 RADIOBUTTON GROUP amt,
              rb3 RADIOBUTTON GROUP amt,
              rb4 RADIOBUTTON GROUP amt DEFAULT 'X'.
SELECTION-SCREEN : END OF BLOCK b3.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  PARAMETERS: p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b2.

*&SPWIZARD: DECLARATION OF TABLECONTROL 'TC_FL' ITSELF
CONTROLS: tc_fl TYPE TABLEVIEW USING SCREEN 9000.

*&SPWIZARD: LINES OF TABLECONTROL 'TC_FL'
DATA:     g_tc_fl_lines  LIKE sy-loopc.

DATA:     ok_code LIKE sy-ucomm.