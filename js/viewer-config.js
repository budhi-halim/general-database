import { technicalDate, requestedDocuments } from './technical-information.js';

const column = (key, label, type = 'text', filter = false) => ({
  key, label, type, filter,
  wrap: ['so_customer', 'srs_customer', 'srs_product', 'srs_remarks', 'sr_customer', 'customer'].includes(key)
});

export const viewers = {
  'sales-orders': {
    title: 'Sales Orders', source: 'sales_orders.json', dateKey: 'so_date',
    note: 'SPB total preserves the source value, not a count. Numeric sorting recognizes grouped amounts; text and malformed amounts sort last.',
    columns: [column('so_date', 'Date', 'date'), column('so_no', 'Number'), column('so_customer', 'Customer'), column('so_po_no', 'PO'), column('so_sales', 'Salesperson', 'text', true), column('so_status', 'Status', 'text', true), column('so_jenis', 'Type', 'text', true), column('tax_stat', 'Tax status', 'text', true), { ...column('so_total_spb', 'SPB total', 'number'), numberFormat: 'grouped' }]
  },
  'stock-requests': {
    title: 'Stock Requests', source: 'stock_requests.json', dateKey: 'srs_date',
    columns: [column('srs_date', 'Date', 'date'), column('srs_no', 'Number'), column('srs_customer', 'Customer'), column('srs_product', 'Product'), column('kode_produk', 'Product code'), column('srs_total_qty', 'Quantity', 'number'), column('srs_status', 'Status', 'text', true), column('is_replacement', 'Replacement', 'text', true), column('srs_remarks', 'Remarks')]
  },
  'sample-requests': {
    title: 'Sample Requests', source: 'sample_requests.json', dateKey: 'sr_date',
    columns: [column('sr_date', 'Date', 'date'), column('sr_no', 'Number'), column('sr_customer', 'Customer'), column('sr_pic', 'PIC', 'text', true), column('sr_srtype', 'Type', 'text', true), column('sr_status', 'Status', 'text', true), { ...column('tot_item', 'Items', 'number'), value: record => String(record.tot_item || '').match(/^\s*(\d+)/)?.[1] || '' }, column('sr_statkirimbarang', 'Shipping', 'text', true), column('sr_statfeedback', 'Feedback', 'text', true)]
  },
  'last-production': {
    title: 'Last Production', source: 'last_production.json', dateKey: 'date',
    columns: [column('date', 'Production date', 'date'), column('customer', 'Customer', 'text', true), column('product_code', 'Product code')]
  },
  'technical-information': {
    title: 'Technical Information', source: 'technical_information.json', dateKey: 'date_tir',
    omitDetails: ['view', 'view2'],
    detailLabels: { id_tir: 'Request ID', tir_cetak: 'Print value', tir_no_srf: 'Related request ID', tir_pic: 'PIC reference', id: 'PIC ID', tir_telp: 'Contact number', customer_code: 'Customer code' },
    columns: [
      { ...column('date_tir', 'Date', 'date'), value: record => technicalDate(record.date_tir) },
      column('tir_no', 'Number'), column('customer', 'Customer', 'text', true),
      { ...column('tir_ir', 'Requested documents', 'text', true), list: true, value: record => requestedDocuments(record.tir_ir) },
      column('pic', 'PIC', 'text', true), column('stat', 'Status', 'text', true),
      column('tir_jenis', 'Type', 'text', true), column('tir_locked_status', 'Lock status', 'text', true),
      column('tujuan_jenis', 'Destination', 'text', true), column('kat', 'Availability', 'text', true),
      column('tir_id_srf', 'Related request'),
      { ...column('tir_additional_remark', 'Remarks'), wrap: true }
    ]
  }
};
