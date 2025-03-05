!macro customInstall
  ; Check if Python is installed
  nsExec::ExecToStack 'py --version'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_YESNO "Python is required but not detected. Would you like to download and install Python now?" IDYES download IDNO continue
    download:
      ExecShell "open" "https://www.python.org/downloads/windows/"
    continue:
  ${EndIf}
  
  ; Install required Python packages if Python is installed
  ${If} $0 == 0
    DetailPrint "Installing required Python packages..."
    nsExec::ExecToLog 'py -m pip install flask==2.3.3 flask-cors==4.0.0'
  ${EndIf}
!macroend
