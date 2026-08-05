"""Generate invoice PDF documents for client delivery."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from . import customers, invoices
from .database import Database


def export_invoice_pdf(db: Database, invoice_id: str, dest_path: str) -> dict[str, Any]:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise RuntimeError("reportlab is required for PDF export. Run: pip install reportlab") from exc

    invoice = invoices.get_invoice(db, invoice_id)
    if not invoice:
        raise ValueError(f"Invoice not found: {invoice_id}")

    customer = customers.get_customer(db, invoice["customerId"])
    company = db.get_company_info()

    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(dest),
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=22,
        textColor=colors.HexColor("#1b4d3e"),
        spaceAfter=6,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#524c47"),
        spaceAfter=2,
    )
    value_style = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=11,
        textColor=colors.HexColor("#1a1814"),
        spaceAfter=8,
    )

    story: list[Any] = []
    logo_path = company.get("logoPath")
    company_title = Paragraph(company["name"], title_style)
    invoice_heading = Paragraph("INVOICE", styles["Heading2"])

    if logo_path and Path(logo_path).is_file():
        logo = Image(str(logo_path), width=1.25 * inch, height=1.25 * inch, kind="proportional")
        header_table = Table(
            [[logo, [company_title, invoice_heading]]],
            colWidths=[1.4 * inch, 5.1 * inch],
        )
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
    else:
        story.append(company_title)
        story.append(invoice_heading)
    story.append(Spacer(1, 12))

    meta_data = [
        ["Invoice #:", invoice["invoiceNumber"], "Date:", invoice["date"]],
    ]
    if invoice.get("dueDate"):
        meta_data.append(["", "", "Due Date:", invoice["dueDate"]])
    meta_data.append(["Status:", invoice["status"].upper(), "", ""])

    meta_table = Table(meta_data, colWidths=[1.1 * inch, 2.2 * inch, 1 * inch, 2.2 * inch])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1a1814")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 16))

    bill_lines = [Paragraph("Bill To", label_style)]
    if customer:
        bill_lines.append(Paragraph(customer["name"], value_style))
        if customer.get("email"):
            bill_lines.append(Paragraph(customer["email"], value_style))
        if customer.get("phone"):
            bill_lines.append(Paragraph(customer["phone"], value_style))
        if customer.get("address"):
            bill_lines.append(Paragraph(customer["address"], value_style))
    else:
        bill_lines.append(Paragraph("—", value_style))
    story.extend(bill_lines)
    story.append(Spacer(1, 16))

    line_rows = [["Description", "Qty", "Unit Price", "Amount"]]
    for line in invoice["lines"]:
        line_rows.append([
            line["description"],
            f"{line['quantity']:g}",
            _money(line["unitPrice"]),
            _money(line["amount"]),
        ])

    lines_table = Table(line_rows, colWidths=[3.4 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch])
    lines_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1b4d3e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 1), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d4cfc4")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f5f0")]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(lines_table)
    story.append(Spacer(1, 16))

    balance = invoice["total"] - invoice["amountPaid"]
    totals_data = [
        ["Subtotal", _money(invoice["subtotal"])],
        ["Tax", _money(invoice["taxAmount"])],
        ["Total", _money(invoice["total"])],
        ["Amount Paid", _money(invoice["amountPaid"])],
        ["Balance Due", _money(balance)],
    ]
    totals_table = Table(totals_data, colWidths=[5.2 * inch, 1.4 * inch])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -2), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LINEABOVE", (0, -2), (-1, -2), 1, colors.HexColor("#d4cfc4")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#1b4d3e")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 24))
    story.append(Paragraph("Thank you for your business.", styles["Normal"]))

    doc.build(story)
    return {"path": str(dest), "status": "ok"}


def _money(amount: float) -> str:
    return f"${amount:,.2f}"
