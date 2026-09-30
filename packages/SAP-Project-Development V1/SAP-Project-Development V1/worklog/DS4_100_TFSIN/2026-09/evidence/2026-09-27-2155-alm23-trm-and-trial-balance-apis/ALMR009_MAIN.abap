*&---------------------------------------------------------------------*
*& Report /FS00/ALMR009
*&---------------------------------------------------------------------*
*&
*&---------------------------------------------------------------------*

INCLUDE /fs00/almr009_top.
INCLUDE /fs00/almr009_f01.

AT SELECTION-SCREEN ON p_layout.
  IF p_layout IS NOT INITIAL.
    gs_variant-variant = p_layout.
  ENDIF.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_layout.
  PERFORM sub_get_layout.

START-OF-SELECTION .
  PERFORM get_data.
  PERFORM display.
