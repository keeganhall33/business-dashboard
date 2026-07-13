#!/usr/bin/env python3
"""Extract the embedded migration from an installation script."""
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('install_script', help='Path to installation SQL script containing embedded migration markers')
    parser.add_argument('output_path', help='Destination file for the extracted migration contents')
    args = parser.parse_args()

    install_path = Path(args.install_script)
    install_text = install_path.read_text()
    begin_marker = '-- BEGIN EMBEDDED MIGRATION:'
    end_marker = '-- END EMBEDDED MIGRATION:'

    begin_idx = install_text.find(begin_marker)
    if begin_idx == -1:
        raise SystemExit('begin marker not found')
    start_idx = install_text.find('\n', begin_idx)
    if start_idx == -1:
        raise SystemExit('malformed begin marker line')
    start_idx += 1

    end_idx = install_text.find(end_marker, start_idx)
    if end_idx == -1:
        raise SystemExit('end marker not found')

    embedded_text = install_text[start_idx:end_idx]
    Path(args.output_path).write_text(embedded_text)

if __name__ == '__main__':
    main()
