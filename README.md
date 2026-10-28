# Solar Load Reader — Mark II

เว็บเครื่องมือช่วยอ่านโหลดไฟฟ้า / ประมาณขนาดระบบโซลาร์ และวิเคราะห์การเงินเบื้องต้น

## เปิดใช้งานยังไง

### วิธีง่ายสุด (บนเครื่องตัวเอง)
1. เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ (Chrome / Edge ก็ได้)
2. หรือลากไฟล์เข้าเบราว์เซอร์

### ผ่าน GitHub Pages
เมื่อเปิด Pages แล้ว จะมีลิงก์ประมาณ:
`https://somyod-creater.github.io/solar-load-reader-mark-ii/`

ไปเปิดที่: Settings → Pages → Deploy from a branch → `main` / `/ (root)`

## ใช้ทำอะไรได้บ้าง
- อ่าน/วิเคราะห์ข้อมูลโหลดที่เกี่ยวข้องกับระบบโซลาร์
- ดูกราฟ (ใช้ Plotly)
- ทำงานกับไฟล์ Excel (ใช้ SheetJS / xlsx)
- หน้า **Summary** หลังกด Run — เห็นตัวเลขหลัก (ขนาดระบบ, ประหยัด/ปี, payback, self-consumption) ในหน้าเดียว ก่อนเจาะ Finance
- **Export ข้อเสนอ** — หน้าเอกสาร 1 หน้าสำหรับส่งลูกค้า (ดาวน์โหลด HTML + เปิดพิมพ์/บันทึก PDF)
- **Wizard 3 ขั้น** บน Input Data — อัปโหลดโหลด → ตั้งค่าระบบ → Run (กด “ดูทั้งหมด” ได้ทุกเมื่อ)
- **คำตัดสินแบต** ชัดๆ จาก FusionSolar — โชว์บนกราฟ Load & Solar และสะท้อนใน Summary

## โครงสร้างโปรเจกต์
- `index.html` — หน้าเว็บหลัก
- `styles.css` — สไตล์
- `app.js` — สคริปต์หลักของแอป
- `chart-theme.js` — ธีมกราฟ Plotly
- `.gitignore` — ไม่ให้ไฟล์ชั่วคราว/Excel temp หลุดขึ้น GitHub

## รันด้วยเซิร์ฟเวอร์ท้องถิ่น
```bash
python3 -m http.server 43127
```
แล้วเปิด http://127.0.0.1:43127/

## ไฟล์ตัวอย่างสำหรับทดสอบ
ดูโฟลเดอร์ [`sample-data/`](sample-data/) — มีโหลดบ้านเรือน 1 เดือน (`household_load_sep2026.xlsx`)

## License
ยังไม่ได้กำหนด — ใช้ส่วนตัว/ทดลอง


Default chart sample profile: `embedded-load-data.js`.
