*&---------------------------------------------------------------------*
*& Include /FS00/ALMR008_TOP                        - Report /FS00/ALMR008
*&---------------------------------------------------------------------*
REPORT /fs00/almr008.

TYPES : BEGIN OF ty_data,
          color    TYPE c LENGTH 4,
          b01      TYPE /fs00/almdt0030,
          b02      TYPE /fs00/almdt0030,
          b03      TYPE /fs00/almdt0030,
          b04      TYPE /fs00/almdt0030,
          b05      TYPE /fs00/almdt0030,
          tot      TYPE tb_limit_amount,
          cb01     TYPE /fs00/almdt0058,
          cb02     TYPE /fs00/almdt0058,
          cb03     TYPE /fs00/almdt0058,
          cb04     TYPE /fs00/almdt0058,
          cb05     TYPE /fs00/almdt0058,
          ctot     TYPE c LENGTH 20,
          colortab TYPE lvc_t_scol,
          celltab  TYPE lvc_t_styl..
          INCLUDE TYPE /fs00/almtr001.
TYPES : END OF ty_data.

DATA : gt_data TYPE TABLE OF ty_data,
       gs_data TYPE ty_data.

FIELD-SYMBOLS:<fs_data> TYPE ty_data.

DATA: gv_sdate TYPE dats,
      gv_edate TYPE dats,
      gv_date  TYPE dats.

DATA: rt_date TYPE RANGE OF dats,
      rt_prd  TYPE RANGE OF vvsart.

DATA: gt_buck TYPE /fs00/almtt001.

DATA:gt_fcat    TYPE  lvc_t_fcat,
     gs_fcat    TYPE lvc_s_fcat,
     gs_variant TYPE disvariant,
     gs_layout  TYPE lvc_s_layo.

DATA : gt_dat TYPE REF TO data,
       gv_div TYPE tb_limit_amount,
       gv_ans TYPE c.

FIELD-SYMBOLS: <fs_dat> TYPE ANY TABLE.

" Data
DATA: gs_celltab TYPE lvc_s_styl,
      gt_celltab TYPE lvc_t_styl..

" Constants
CONSTANTS: gc_style_bold            TYPE int4 VALUE '00000121'.

" Data
DATA : gt_color TYPE STANDARD TABLE OF lvc_s_scol.

"" TRM Data
TYPES: BEGIN OF ty_trm,
         color TYPE c LENGTH 4,
         stype TYPE c LENGTH 2,
         sdesc TYPE c LENGTH 100,
         date  TYPE dats,
         b01   TYPE tb_limit_amount,
         b02   TYPE tb_limit_amount,
         b03   TYPE tb_limit_amount,
         b04   TYPE tb_limit_amount,
         b05   TYPE tb_limit_amount,
         tot   TYPE tb_limit_amount.
         INCLUDE TYPE /fs00/cds0001.
TYPES: END OF ty_trm.

DATA: gt_trm TYPE TABLE OF ty_trm,
      gs_trm TYPE ty_trm.


SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
  PARAMETERS: p_mon TYPE n LENGTH 2 OBLIGATORY.
  PARAMETERS: p_year TYPE n LENGTH 4 OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN : BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  PARAMETERS: rb1 RADIOBUTTON GROUP a,
              rb2 RADIOBUTTON GROUP a,
              rb3 RADIOBUTTON GROUP a,
              rb4 RADIOBUTTON GROUP a  DEFAULT 'X'.
SELECTION-SCREEN : END OF BLOCK b2.

SELECTION-SCREEN : BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS: p_check AS CHECKBOX.
  PARAMETERS: p_isplit AS CHECKBOX.
SELECTION-SCREEN : END OF BLOCK b3.

SELECTION-SCREEN BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-004.
  PARAMETERS   p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b4.