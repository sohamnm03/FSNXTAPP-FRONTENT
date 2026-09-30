*&---------------------------------------------------------------------*
*& Report /FS00/ALMR003
*&---------------------------------------------------------------------*
*&
*&---------------------------------------------------------------------*

INCLUDE /FS00/ALMR015_TOP.                       .    " Global Data

INCLUDE /FS00/ALMR015_F01.                       .  " FORM-Routines

AT SELECTION-SCREEN ON p_layout.
  IF p_layout IS NOT INITIAL.
    gs_variant-variant = p_layout.
  ENDIF.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_layout.
  PERFORM sub_get_layout.

START-OF-SELECTION.
  PERFORM get_data.
  PERFORM display_data.
