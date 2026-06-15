import os
import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def inspect_seif_xltm():
    desktop_path = "D:\\Users\\Admin\\Desktop"
    target_file = "seif.xltm"
    full_path = os.path.join(desktop_path, target_file)
    if not os.path.exists(full_path):
        print(f"File not found: {target_file}")
        return
        
    print(f"\n========================================\nAnalyzing target file: {target_file}")
    with zipfile.ZipFile(full_path, 'r') as z:
        # Read workbook.xml to get sheet names
        wb_xml = z.read('xl/workbook.xml')
        root = ET.fromstring(wb_xml)
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        sheets = []
        for s in root.findall('.//main:sheet', ns):
            sheets.append((s.get('name'), s.get('sheetId')))
            
        print("Sheets in workbook:", sheets)
        
        shared_strings = []
        try:
            sst_xml = z.read('xl/sharedStrings.xml')
            sst_root = ET.fromstring(sst_xml)
            for si in sst_root.findall('.//main:t', ns):
                shared_strings.append(si.text)
        except KeyError:
            pass
            
        print("Shared Strings count:", len(shared_strings))
        
        # Read sheets content using relation mapping or naming sequence
        # Let's inspect xl/worksheets/sheet1.xml, sheet2.xml, sheet3.xml etc.
        worksheets = [member for member in z.namelist() if member.startswith('xl/worksheets/sheet')]
        worksheets.sort(key=lambda w: int(''.join(filter(str.isdigit, w))))
        
        for idx, ws in enumerate(worksheets):
            if idx < len(sheets):
                sheet_name = sheets[idx][0]
            else:
                sheet_name = f"Sheet {idx+1}"
                
            ws_xml = z.read(ws)
            ws_root = ET.fromstring(ws_xml)
            print(f"\nSheet Name: {sheet_name} ({ws})")
            
            rows = ws_root.findall('.//main:row', ns)
            if not rows:
                print("  (Empty sheet)")
                continue
                
            print(f"  Total rows: {len(rows)}")
            
            # Print row 1
            row = rows[0]
            row_vals = []
            for c in row.findall('main:c', ns):
                t = c.get('t')
                v_elem = c.find('main:v', ns)
                cell_val = ""
                if v_elem is not None:
                    val = v_elem.text
                    if t == 's':
                        i = int(val)
                        if i < len(shared_strings):
                            cell_val = shared_strings[i]
                    else:
                        cell_val = val
                else:
                    is_elem = c.find('.//main:t', ns)
                    if is_elem is not None:
                        cell_val = is_elem.text
                row_vals.append(f"{c.get('r')}:{cell_val}")
            print(f"  Row 1 (Header): {row_vals}")
            
            # Print first data row
            if len(rows) > 1:
                row_data = rows[1]
                row_data_vals = []
                for c in row_data.findall('main:c', ns):
                    t = c.get('t')
                    v_elem = c.find('main:v', ns)
                    cell_val = ""
                    if v_elem is not None:
                        val = v_elem.text
                        if t == 's':
                            i = int(val)
                            if i < len(shared_strings):
                                cell_val = shared_strings[i]
                        else:
                            cell_val = val
                    else:
                        is_elem = c.find('.//main:t', ns)
                        if is_elem is not None:
                            cell_val = is_elem.text
                    row_data_vals.append(f"{c.get('r')}:{cell_val}")
                print(f"  Row 2 (Data): {row_data_vals}")

if __name__ == "__main__":
    inspect_seif_xltm()
