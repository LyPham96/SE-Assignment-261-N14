# Cấu hình chung cho latexmk — VS Code, terminal và GitHub Actions đều đọc file này
$pdf_mode = 1;            # pdflatex -> PDF
$out_dir  = 'build';      # file rác (.aux, .log...) và main.pdf nằm trong build/
@default_files = ('main.tex');
$pdflatex = 'pdflatex -interaction=nonstopmode -file-line-error -synctex=1 %O %S';
