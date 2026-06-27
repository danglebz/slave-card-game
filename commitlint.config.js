// บังคับรูปแบบ Conventional Commits (เข้ากับ commit-and-tag-version ที่ใช้ออก release)
// ตัวอย่างที่ผ่าน: feat(notify): ..., fix: ..., chore(release): 1.12.0
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // เผื่อ subject ภาษาไทย/อีโมจิ — ไม่บังคับ case, ผ่อนความยาวให้ยาวขึ้น
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
  },
};
