#!/usr/bin/env python3
"""ETL de Excel a Supabase para personas hospitalizadas.

Por defecto genera un CSV normalizado. Si agregas `--upload`, sube los datos a
Supabase usando upsert por `import_key`, sin duplicar filas ya importadas.

Ejemplos:
  python scripts/etl_personas_hospitalizadas.py "C:\\ruta\\archivo.xlsx"
  python scripts/etl_personas_hospitalizadas.py "archivo1.xlsx" "archivo2.xlsx" --upload
  python scripts/etl_personas_hospitalizadas.py "archivo.xlsx" --upload --supabase-url https://xxx.supabase.co --supabase-key SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

OUTPUT_COLUMNS = [
    "import_key",
    "cedula",
    "nombre",
    "apellido",
    "edad",
    "estatus",
    "locacion",
    "hospital_normalizado",
    "ultima_ubicacion",
    "condicion",
    "ultima_actualizacion",
    "contacto",
]

HEADER_ALIASES = {
    "cedula": {"c i", "ci", "c.i", "cedula", "cedula identidad", "documento"},
    "nombre": {"nombre", "nombres"},
    "apellido": {"apellido", "apellidos"},
    "edad": {"edad"},
    "estatus": {"status", "estatus", "estado"},
    "locacion": {"locacion", "ubicacion", "location", "hospital"},
    "ultima_ubicacion": {"ultima ubicacion", "ultima ubicacion conocida"},
    "condicion": {
        "condicion o posible traslado",
        "condicion",
        "posible traslado",
        "traslado",
    },
    "ultima_actualizacion": {
        "ultima actualizacion",
        "actualizacion",
        "fecha actualizacion",
    },
    "contacto": {"contacto", "telefono", "telefono contacto"},
}

REQUIRED_COLUMNS = ("nombre", "estatus", "locacion")

GENERIC_HOSPITAL_WORDS = {
    "hospital",
    "centro",
    "clinico",
    "clinica",
    "dr",
    "dra",
    "doctor",
    "general",
    "universitario",
    "universitaria",
    "de",
    "del",
    "la",
    "las",
    "los",
    "el",
    "y",
}

HOSPITAL_STATUS_WORDS = {
    "hospital",
    "hospitalizado",
    "hospitalizada",
    "hospitalizacion",
    "hospitalizadoa",
    "hospitalizadao",
    "internado",
    "internada",
    "ingresado",
    "ingresada",
    "admision",
    "admitido",
    "admitida",
}

NEGATIVE_STATUS_WORDS = {
    "no",
    "sin",
    "fallecido",
    "fallecida",
    "refugio",
    "busqueda",
    "encontrado",
    "encontrada",
    "desaparecido",
    "desaparecida",
}

# Mapa inicial de hospitales conocidos. Puedes ampliarlo cuando aparezcan nuevos
# nombres escritos de otra forma en futuros Excel.
CANONICAL_HOSPITALS = {
    "HOSPITAL JOSE MARIA VARGAS": {
        "jose maria vargas",
        "hospital jose maria vargas",
        "hospital jose maria",
        "hospital vargas",
        "vargas",
    },
    "HOSPITAL PEREZ CARRENO": {
        "perez carreno",
        "perez carreño",
        "hospital perez carreno",
        "hospital perez carreño",
        "perez carreno hospital",
    },
    "HOSPITAL DR DOMINGO LUCIANI": {
        "domingo luciani",
        "dr domingo luciani",
        "hospital domingo luciani",
        "hospital dr domingo luciani",
    },
    "HOSPITAL PERIFERICO DE CATIA": {
        "periferico catia",
        "periferico de catia",
        "hospital periferico catia",
        "hospital periferico de catia",
    },
    "HOSPITAL MILITAR DR CARLOS ARVELO": {
        "carlos arvelo",
        "militar carlos arvelo",
        "hospital militar carlos arvelo",
        "hospital militar dr carlos arvelo",
    },
}


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def compact_key(value: object) -> str:
    return normalize_text(value).replace(" ", "")


def clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return re.sub(r"\s+", " ", text)


def title_clean(value: object) -> str:
    text = clean(value)
    return text


def normalize_hospital_key(value: object) -> str:
    words = normalize_text(value).split()
    return " ".join(
        word for word in words if len(word) > 1 and word not in GENERIC_HOSPITAL_WORDS
    )


def canonicalize_hospital(value: object) -> tuple[str, str]:
    raw_key = normalize_text(value)
    reduced_key = normalize_hospital_key(value)
    candidates = {raw_key, reduced_key}

    best_name = ""
    best_score = 0.0
    for canonical, aliases in CANONICAL_HOSPITALS.items():
        canonical_key = normalize_hospital_key(canonical)
        for alias in aliases | {canonical, canonical_key}:
            alias_key = normalize_hospital_key(alias)
            if not alias_key:
                continue
            token_overlap = len(set(reduced_key.split()) & set(alias_key.split()))
            score = max(
                SequenceMatcher(None, reduced_key, alias_key).ratio(),
                SequenceMatcher(None, raw_key, normalize_text(alias)).ratio(),
            )
            if alias_key in candidates or reduced_key in alias_key or alias_key in reduced_key:
                score = max(score, 0.95)
            elif token_overlap >= 2:
                score = max(score, 0.88)

            if score > best_score:
                best_score = score
                best_name = canonical

    if best_score >= 0.82 and best_name:
        return best_name, normalize_hospital_key(best_name)

    fallback = clean(value).upper()
    fallback = re.sub(r"\s+", " ", fallback).strip()
    return fallback, reduced_key


def is_hospital_status(value: object) -> bool:
    text = normalize_text(value)
    if not text:
        return False
    words = set(text.split())
    if words & NEGATIVE_STATUS_WORDS and not (words & HOSPITAL_STATUS_WORDS):
        return False
    if any(word.startswith("hospital") for word in words):
        return True
    if words & HOSPITAL_STATUS_WORDS:
        return True
    return SequenceMatcher(None, text, "hospital").ratio() >= 0.82


def normalize_status(value: object) -> str:
    return "HOSPITAL" if is_hospital_status(value) else ""


def clean_age(value: object) -> str:
    text = normalize_text(value)
    if not text:
        return ""

    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return ""

    number = float(match.group(0))
    if "mes" in text:
        return "0"
    if "ano" in text or "anos" in text or "edad" in text:
        return str(int(number))
    return str(int(number)) if number.is_integer() else str(number)


def clean_excel_date(value: object) -> str:
    text = clean(value)
    if not text:
        return ""
    try:
        serial = float(text)
    except ValueError:
        pass
    else:
        if serial < 30000:
            return ""
        date = datetime(1899, 12, 30) + timedelta(days=serial)
        return date.strftime("%Y-%m-%d")

    normalized = text.replace("/", "-").strip()
    date_formats = ("%Y-%m-%d", "%d-%m-%Y", "%d-%m-%y", "%m-%d-%Y")
    for date_format in date_formats:
        try:
            date = datetime.strptime(normalized, date_format)
        except ValueError:
            continue
        return date.strftime("%Y-%m-%d")

    return ""


def col_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    total = 0
    for char in letters:
        total = total * 26 + (ord(char.upper()) - ord("A") + 1)
    return total - 1


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    kind = cell.attrib.get("t")
    value = cell.find("a:v", NS)
    if kind == "inlineStr":
        node = cell.find("a:is/a:t", NS)
        return node.text if node is not None and node.text else ""
    if value is None or value.text is None:
        return ""
    if kind == "s":
        return shared_strings[int(value.text)] if value.text else ""
    return value.text


def read_shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []
    root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(".//a:t", NS))
        for item in root.findall("a:si", NS)
    ]


def first_sheet_path(workbook: zipfile.ZipFile) -> str:
    sheets = sorted(
        name
        for name in workbook.namelist()
        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
    )
    if not sheets:
        raise ValueError("El archivo no contiene hojas de Excel legibles.")
    return sheets[0]


def read_xlsx_rows(path: Path) -> list[dict[int, str]]:
    with zipfile.ZipFile(path) as workbook:
        shared_strings = read_shared_strings(workbook)
        sheet = ET.fromstring(workbook.read(first_sheet_path(workbook)))

    rows: list[dict[int, str]] = []
    for row in sheet.findall(".//a:sheetData/a:row", NS):
        values: dict[int, str] = {}
        for cell in row.findall("a:c", NS):
            values[col_index(cell.attrib.get("r", ""))] = cell_value(cell, shared_strings)
        rows.append(values)
    return rows


def map_columns(header_row: dict[int, str], source: Path) -> dict[str, int | None]:
    headers = {normalize_text(value): index for index, value in header_row.items()}
    result: dict[str, int | None] = {}
    for field, aliases in HEADER_ALIASES.items():
        result[field] = next((headers[normalize_text(alias)] for alias in aliases if normalize_text(alias) in headers), None)

    missing = [field for field in REQUIRED_COLUMNS if result[field] is None]
    if missing:
        detected = ", ".join(sorted(headers))
        raise ValueError(
            f"{source.name}: faltan columnas requeridas {missing}. "
            f"Columnas detectadas: {detected}"
        )
    return result


def build_import_key(row: dict[str, str]) -> str:
    if row["cedula"]:
        return f"ci:{compact_key(row['cedula'])}"
    parts = [
        row["nombre"],
        row["apellido"],
        row["edad"],
        row["hospital_normalizado"],
    ]
    return "sin-ci:" + compact_key("|".join(parts))


def merge_row(existing: dict[str, str], incoming: dict[str, str]) -> dict[str, str]:
    merged = existing.copy()
    for field, value in incoming.items():
        if not merged.get(field) and value:
            merged[field] = value
    return merged


def extract_people(path: Path) -> list[dict[str, str]]:
    rows = read_xlsx_rows(path)
    if not rows:
        return []

    columns = map_columns(rows[0], path)
    people: list[dict[str, str]] = []

    for raw in rows[1:]:
        estatus = normalize_status(raw.get(columns["estatus"]))  # type: ignore[index]
        if estatus != "HOSPITAL":
            continue

        locacion_original = clean(raw.get(columns["locacion"]))  # type: ignore[index]
        nombre = title_clean(raw.get(columns["nombre"]))  # type: ignore[index]
        apellido = (
            title_clean(raw.get(columns["apellido"])) if columns["apellido"] is not None else ""
        )
        if not locacion_original or not (nombre or apellido):
            continue

        locacion_canonica, hospital_normalizado = canonicalize_hospital(locacion_original)
        row = {
            "import_key": "",
            "cedula": clean(raw.get(columns["cedula"])) if columns["cedula"] is not None else "",  # type: ignore[index]
            "nombre": nombre,
            "apellido": apellido,
            "edad": clean_age(raw.get(columns["edad"])) if columns["edad"] is not None else "",  # type: ignore[index]
            "estatus": estatus,
            "locacion": locacion_canonica,
            "hospital_normalizado": hospital_normalizado,
            "ultima_ubicacion": title_clean(raw.get(columns["ultima_ubicacion"])) if columns["ultima_ubicacion"] is not None else "",  # type: ignore[index]
            "condicion": title_clean(raw.get(columns["condicion"])) if columns["condicion"] is not None else "",  # type: ignore[index]
            "ultima_actualizacion": clean_excel_date(raw.get(columns["ultima_actualizacion"])) if columns["ultima_actualizacion"] is not None else "",  # type: ignore[index]
            "contacto": clean(raw.get(columns["contacto"])) if columns["contacto"] is not None else "",  # type: ignore[index]
        }
        row["import_key"] = build_import_key(row)
        people.append(row)

    return people


def normalize_files(files: list[Path]) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {}
    for file in files:
        for person in extract_people(file):
            key = person["import_key"]
            merged[key] = merge_row(merged[key], person) if key in merged else person
    return list(merged.values())


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def prepare_for_upload(row: dict[str, str]) -> dict[str, object | None]:
    payload: dict[str, object | None] = {}
    for key, value in row.items():
        if value == "":
            payload[key] = None
        elif key == "edad":
            payload[key] = int(float(value))
        else:
            payload[key] = value
    return payload


def upload_to_supabase(
    rows: list[dict[str, str]],
    supabase_url: str,
    supabase_key: str,
    table: str,
    batch_size: int,
) -> None:
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/{table}?on_conflict=import_key"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    for start in range(0, len(rows), batch_size):
        batch = [prepare_for_upload(row) for row in rows[start : start + batch_size]]
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Supabase respondio status {response.status}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Error subiendo a Supabase: {exc.code} {detail}") from exc

        print(f"Subidas {min(start + batch_size, len(rows))}/{len(rows)} filas")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ETL de Excel a CSV/Supabase para personas_hospitalizadas."
    )
    parser.add_argument("excels", nargs="+", type=Path, help="Archivo(s) .xlsx")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("personas_hospitalizadas_normalizado.csv"),
        help="CSV de salida.",
    )
    parser.add_argument("--upload", action="store_true", help="Sube los datos a Supabase.")
    parser.add_argument(
        "--supabase-url",
        default=os.getenv("SUPABASE_URL"),
        help="URL del proyecto Supabase. Tambien puede venir de SUPABASE_URL.",
    )
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        help="Service role key. Tambien puede venir de SUPABASE_SERVICE_ROLE_KEY.",
    )
    parser.add_argument("--table", default="personas_hospitalizadas")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    files = [file.expanduser().resolve() for file in args.excels]
    for file in files:
        if not file.exists():
            raise FileNotFoundError(f"No existe el archivo: {file}")
        if file.suffix.lower() != ".xlsx":
            raise ValueError(f"Solo se aceptan archivos .xlsx: {file}")

    rows = normalize_files(files)
    write_csv(args.output, rows)

    minors = sum(1 for row in rows if row["edad"].isdigit() and int(row["edad"]) < 18)
    with_id = sum(1 for row in rows if row["cedula"])
    hospitals = sorted({row["locacion"] for row in rows})

    print(f"Filas normalizadas: {len(rows)}")
    print(f"Filas con C.I.: {with_id}")
    print(f"Filas menores de 18: {minors}")
    print(f"Hospitales detectados: {len(hospitals)}")
    print(f"CSV generado: {args.output}")

    if args.upload:
        if not args.supabase_url or not args.supabase_key:
            raise ValueError(
                "Para subir usa --supabase-url y --supabase-key, o define "
                "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."
            )
        upload_to_supabase(
            rows,
            supabase_url=args.supabase_url,
            supabase_key=args.supabase_key,
            table=args.table,
            batch_size=args.batch_size,
        )
        print("Carga a Supabase completada.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
