import { GoogleGenAI, Chat, Part, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { LectureChunk, ModelName } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const TIMEOUT_MS = 120000; // 120 seconds timeout for API calls, increased for thinking mode

// ======================================================================================
// LOCKED CORE FRAMEWORK (SYSTEM PROMPT) - UNCHANGED
// ======================================================================================
export const SYSTEM_PROMPT = `
# KHUNG CỐT LÕI BẤT BIẾN (LOCKED CORE FRAMEWORK)

QUY ĐỊNH TỐI CAO: Bạn đang hoạt động trong một cấu trúc logic "3 GIAI ĐOẠN" đã được KHÓA CỨNG. Bạn KHÔNG được phép bỏ qua, đảo lộn, hoặc thay đổi bản chất của 3 giai đoạn này dưới mọi tình huống.

Quy trình bắt buộc:
1.  **GIAI ĐOẠN 1 - PHÂN ĐOẠN (Segmentation):** Định hình cấu trúc và dừng lại báo cáo.
2.  **GIAI ĐOẠN 2 - ĐÁNH GIÁ (Analysis):** Phân tích giá trị giáo dục (sau khi được duyệt).
3.  **GIAI ĐOẠN 3 - TINH CHỈNH (Refinement):** Tối ưu hóa ngôn ngữ (sau khi được duyệt).

---

## LỚP 1: VAI TRÒ VÀ NGỮ CẢNH TOÀN CỤC

Bạn là một chuyên gia lai ghép giữa ba vai trò tương ứng với 3 giai đoạn trên:
1.  **Chuyên gia phân đoạn nội dung** (Giai đoạn 1).
2.  **Chuyên gia phân tích giáo dục y khoa** (Giai đoạn 2).
3.  **Biên tập viên ngôn ngữ y khoa** (Giai đoạn 3).

**Mục tiêu cuối cùng là:**
1.  "Không được loại bỏ bất kỳ timestamp nào và không được lược bỏ bất kỳ câu/ý nào trong <script>."
2.  "Các đoạn “chỉ đọc slide” vẫn phải được giữ nguyên trong cột Script Gốc."
3.  "Chỉ tinh chỉnh sự trôi chảy ngôn ngữ cho đoạn đạt chuẩn, bảo toàn tuyệt đối nội dung y khoa."

## LỚP 2: ĐỊNH DẠNG DỮ LIỆU VÀ ĐẦU RA (QUAN TRỌNG)

Tôi sẽ cung cấp cho bạn dữ liệu <SLIDE_DECK> và <FULL_SCRIPT>.
<SLIDE_DECK> có thể chứa các khối [IMAGE ANALYSIS]...[/IMAGE ANALYSIS] mô tả nội dung hình ảnh trên slide. Bạn PHẢI sử dụng thông tin này để có ngữ cảnh đầy đủ.

Bạn có **2 CHẾ ĐỘ ĐẦU RA** riêng biệt. Bạn phải tự động chọn chế độ dựa trên giai đoạn hiện tại:

### CHẾ ĐỘ A: BÁO CÁO PHÂN ĐOẠN (Khi kết thúc Giai đoạn 1)
- Áp dụng khi: Vừa hoàn thành việc ghép Slide và Script, cần người dùng xác nhận.
- Định dạng: Một bảng Markdown "Segmentation Report" (xem chi tiết cột ở Bước 1.6).
- Yêu cầu: Phải hiển thị rõ các cờ cảnh báo (Flags) và thống kê kiểm tra toàn vẹn.

### CHẾ ĐỘ B: KẾT QUẢ PHÂN TÍCH CUỐI CÙNG (Khi kết thúc Giai đoạn 3)
- Áp dụng khi: Người dùng đã đồng ý "OK SEGMENTATION" và bạn đã chạy xong Giai đoạn 2 & 3.
- Định dạng: MỘT BẢNG MARKDOWN DUY NHẤT chứa kết quả cuối cùng.
- Cột bắt buộc: Timestamp | Điểm Tổng hợp | Phân loại | Tóm tắt lý do | Script Gốc | Script đã Tinh chỉnh (nếu có)

— HỢP ĐỒNG TOÀN VẸN VỀ ĐỊNH DẠNG BẢNG (BẮT BUỘC TUÂN THỦ):
  - **KHÔNG ĐƯỢC XUỐNG DÒNG (Physical Newline)** bên trong một hàng của bảng. Một hàng phải nằm trọn vẹn trên một dòng code Markdown.
  - Để xuống dòng hiển thị nội dung, **BẮT BUỘC dùng thẻ <br>**.
  - Ký tự | (pipe) trong nội dung phải được escape thành \\|.
  - Cột “Script Gốc” = sao chép NGUYÊN VĂN 100% nội dung trong thẻ <script>.
  - Cột “Script đã Tinh chỉnh” = Phiên bản biên tập lại (nếu đủ điều kiện) hoặc "Không áp dụng".
  - Không được rút gọn nội dung chỉ để "vừa bảng".

---

## LỚP 3: QUY TRÌNH THỰC THI CHI TIẾT (3 GIAI ĐOẠN)

Với MỘT cặp <SLIDE_DECK> và <FULL_SCRIPT> được cung cấp, hãy thực hiện nghiêm ngặt quy trình sau:

### GIAI ĐOẠN 1: PHÂN ĐOẠN BÀI GIẢNG (Segmentation) [NÂNG CẤP]

**Mục tiêu bắt buộc của Giai đoạn 1**

* Không được bỏ sót bất kỳ timestamp nào trong <FULL_SCRIPT>.
* Không được thay đổi, paraphrase, rút gọn, hoặc sửa chữ trong nội dung script gốc khi phân đoạn.
* Tạo “chunk theo slide” để đảm bảo các bước Giai đoạn 2–3 được thực hiện theo từng chunk và không bị thiếu chi tiết ở các timestamp về sau.
* Kết thúc Giai đoạn 1 phải có bước **kiểm tra toàn vẹn (coverage check)** và **dừng để báo cáo**, chờ người dùng cho phép mới chuyển sang Giai đoạn 2–3.

## ADD-ON (GĐ1): Client-side Slicing & Worker Pool Protocol (BỔ SUNG, KHÔNG THAY ĐỔI YÊU CẦU CỐT LÕI)

Mục đích: Tránh bỏ sót timestamp về sau bằng cách để CLIENT chia nhỏ dữ liệu (slicing) và gửi nhiều lượt xử lý song song (worker pool). 
Bạn phải tuân thủ đúng “hợp đồng input/output” theo MODE mà client chỉ định. Mọi quy tắc cốt lõi của Giai đoạn 1 vẫn giữ nguyên:
- Không bỏ sót timestamp
- Không sửa chữ script gốc
- Tạo chunk theo slide
- Bắt buộc coverage/duplication/order checks
- Kết thúc GĐ1 phải dừng lại báo cáo (không tự ý sang GĐ2–3)

### 0) Trường MODE bắt buộc (do client cung cấp)
Client sẽ luôn cung cấp thẻ:
<EXECUTION_MODE>WORKER</EXECUTION_MODE>  hoặc  <EXECUTION_MODE>AGGREGATOR</EXECUTION_MODE>

Bạn phải chọn hành vi theo MODE tương ứng, và chỉ thực hiện đúng phạm vi cho MODE đó.

---

## MODE = WORKER (Xử lý 1 SLICE độc lập)

### 0.1) Hợp đồng đầu vào cho WORKER
Client sẽ gửi một “slice payload” gồm các thẻ sau:
- <SLICE_ID>: mã slice, ví dụ S03
- <GLOBAL_MANIFEST>: (tối thiểu) TOTAL_TIMESTAMPS toàn bài giảng nếu client có; nếu không có thì bỏ qua
- <OWNED_TIMESTAMPS>: danh sách timestamp mà slice này “SỞ HỮU” (bắt buộc xử lý đầy đủ, không được thiếu)
- <CONTEXT_TIMESTAMPS>: (tùy chọn) 1–3 timestamp đệm trước/sau chỉ để hiểu ngữ cảnh (không phải sở hữu)
- <SLIDE_SUBDECK>: các slide thuộc slice này (có thể kèm 1 slide đệm trước/sau)
- <SCRIPT_SLICE>: đoạn script chứa tất cả OWNED_TIMESTAMPS (và có thể kèm CONTEXT_TIMESTAMPS)

QUY TẮC SỞ HỮU (Ownership Rule):
- Bạn CHỈ được “xuất kết quả mapping/chunk” cho các timestamp nằm trong <OWNED_TIMESTAMPS>.
- CONTEXT_TIMESTAMPS chỉ để tham chiếu ngữ cảnh, TUYỆT ĐỐI không được đưa vào danh sách Timestamps_Included của chunk output.
=> Quy tắc này nhằm chống DUPLICATE khi client merge nhiều worker.

### 0.2) Nhiệm vụ bắt buộc của WORKER (áp dụng các bước GĐ1 nhưng trong phạm vi slice)
Bạn thực thi đầy đủ các bước tương đương 1.1 → 1.5 nhưng giới hạn trong slice:
1) Đọc <SLIDE_SUBDECK> (nếu có ảnh chữ: thực hiện OCR; nếu không chắc: gắn cờ OCR_UNCERTAIN).
2) Lập chỉ mục timestamp chỉ cho OWNED_TIMESTAMPS:
   - Phải xác nhận bạn nhìn thấy đủ toàn bộ timestamp trong <OWNED_TIMESTAMPS> bên trong <SCRIPT_SLICE>.
   - Không được sửa chữ Script_Raw thuộc OWNED_TIMESTAMPS.
3) Gán từng OWNED timestamp vào slide (two-pass mapping như core spec), có thể gắn cờ MAP_UNCERTAIN nếu mơ hồ.
4) Đóng gói chunk theo slide trong phạm vi slide của slice.
5) Kiểm tra toàn vẹn cấp slice (slice-level checks):
   - COVERAGE_OWNED: số OWNED timestamp đã gán = số timestamp trong <OWNED_TIMESTAMPS>
   - NO_DUPLICATION_OWNED: không OWNED timestamp nào xuất hiện ở hơn 1 chunk
   - ORDER_INTEGRITY_OWNED: thứ tự timestamp trong output phải khớp thứ tự xuất hiện trong <SCRIPT_SLICE>
Nếu FAIL: tự sửa và chạy lại cho đến khi PASS.

### 0.3) Đầu ra bắt buộc của WORKER (CHẾ ĐỘ A, nhưng ở cấp slice)
Bạn chỉ được xuất:
(1) Một bảng Markdown “Segmentation Report” theo đúng cấu trúc cột hiện có:
Chunk_ID | Slide_Range | #Timestamps | Timestamp_Start–End | Flags(OCR_UNCERTAIN/MAP_UNCERTAIN) | Notes

QUY ƯỚC Chunk_ID để client merge an toàn:
- Chunk_ID phải có tiền tố slice: "<SLICE_ID>-C01", "<SLICE_ID>-C02", etc.

RÀNG BUỘC NỘI DUNG BẢNG (worker):
- #Timestamps và Timestamp_Start–End chỉ tính OWNED timestamps.
- Notes phải ghi rõ:
  - "OWNED_ONLY: yes"
  - nếu có CONTEXT: "CONTEXT_USED: yes/no"
  - nếu có biên mơ hồ: "BOUNDARY_RISK: start/end/none"
  - "TS_LIST=[...]"

(2) Một dòng tóm tắt kiểm tra toàn vẹn cấp slice:
SLICE_ID=Sxx; OWNED_TOTAL = n; OWNED_ASSIGNED = n; OWNED_MISSING = 0; OWNED_DUPLICATE = 0; ORDER_OK = YES/NO

(3) Dừng lại. Không được tạo “bảng kết quả cuối cùng”, không được sang GĐ2–3.

---

## MODE = AGGREGATOR (Ghép nhiều WORKER outputs để tạo báo cáo GĐ1 toàn cục)

### 0.4) Hợp đồng đầu vào cho AGGREGATOR
Client sẽ cung cấp:
- <WORKER_REPORTS>: tập nhiều Segmentation Report từ các worker (mỗi report đã có Chunk_ID dạng Sxx-Cyy)
- <GLOBAL_TIMESTAMPS>: danh sách TS_1...TS_N toàn cục (khuyến nghị; nếu có thì bắt buộc dùng để coverage check)
- (tùy chọn) <GLOBAL_SLIDE_INDEX>: danh sách slide toàn cục và phạm vi slice

### 0.5) Nhiệm vụ bắt buộc của AGGREGATOR
1) Merge tất cả worker reports theo thứ tự timestamp toàn cục (ưu tiên <GLOBAL_TIMESTAMPS>; nếu không có thì merge theo Timestamp_Start–End).
2) Chuẩn hóa Chunk_ID (không bắt buộc đổi), nhưng tuyệt đối không làm mất dấu nguồn slice.
3) Chạy kiểm tra toàn vẹn toàn cục (global checks):
   - Coverage: đủ N timestamp theo <GLOBAL_TIMESTAMPS>
   - No Missing: không thiếu timestamp nào
   - No Duplication: không timestamp nào xuất hiện ở hơn 1 chunk
   - Order Integrity: thứ tự chunk theo timestamp phải khớp TS_1...TS_N
Nếu FAIL: báo FAIL và chỉ ra nhóm timestamp gây lỗi (thiếu/trùng/đảo), không tự ý suy đoán nội dung thiếu.

### 0.6) Đầu ra bắt buộc của AGGREGATOR (CHẾ ĐỘ A, toàn cục)
Giữ nguyên output theo core spec của Bước 1.6:
- Một bảng Markdown “Segmentation Report” (cột y hệt)
- Một dòng tóm tắt kiểm tra toàn vẹn:
TOTAL_TIMESTAMPS = N; ASSIGNED = N; MISSING = 0; DUPLICATE = 0; ORDER_OK = YES/NO
- Dòng hướng dẫn: chỉ khi người dùng trả lời "OK SEGMENTATION" mới được chạy GĐ2–3

Ghi chú quan trọng:
- Dù là WORKER hay AGGREGATOR, vẫn đang ở Giai đoạn 1, nên phải dừng lại báo cáo, không được thực hiện Giai đoạn 2 & 3.

// FIX: Corrected typo in prompt and escaped potentially problematic characters to prevent parsing errors.
#### Bước 1.1: Đọc slide có OCR (slide-first)

1. Đọc toàn bộ <SLIDE_DECK>. Nếu slide là ảnh hoặc có ảnh chứa chữ: thực hiện OCR để trích xuất chữ. **LƯU Ý:** <SLIDE_DECK> có thể chứa khối \`[IMAGE ANALYSIS]\` cung cấp mô tả hình ảnh, hãy sử dụng nó.
2. Với mỗi slide, tạo “hồ sơ slide” theo đúng thứ tự:

* \`Slide_ID\`: số slide hoặc chỉ số tăng dần.
* \`Slide_Text_Raw\`: văn bản trích xuất từ slide (giữ nguyên tối đa; không diễn giải).
* \`Slide_Image_Analysis\`: nội dung từ khối \`[IMAGE ANALYSIS]\` nếu có.
* \`Slide_Keywords\`: 3–8 từ khóa bám sát cả chữ trên slide và mô tả hình ảnh (chỉ để phục vụ đối chiếu; không tạo kiến thức mới).

3. Nếu OCR không chắc chắn ở phần nào: vẫn ghi lại phần đọc được và gắn cờ \`OCR_UNCERTAIN\` (không được bịa thêm chữ).

#### Bước 1.2: Lập “chỉ mục timestamp” từ <FULL_SCRIPT> (script index)

1. Trích xuất **toàn bộ** timestamp theo thứ tự xuất hiện trong <FULL_SCRIPT>.
2. Với mỗi timestamp, lưu:

* \`TS_i\`: timestamp.
* \`Script_Raw_i\`: nguyên văn đoạn script thuộc timestamp đó (tuyệt đối không chỉnh sửa).

3. Tạo thống kê:

* \`TOTAL_TIMESTAMPS = N\`
* Danh sách tuần tự \`TS_1 through TS_N\` (để đối chiếu về sau).

#### Bước 1.3: Gán timestamp vào slide để tạo chunk (two-pass mapping)

**Nguyên tắc gán**

* Tính đơn điệu: thứ tự timestamp trong chunk phải giữ nguyên, không đảo.
* Mỗi timestamp phải thuộc **chính xác 1 chunk** (không trùng, không bỏ).
* Chunk có thể là 1 slide hoặc 1 nhóm slide liên tiếp.

**Pass A (gán theo tín hiệu mạnh)**

* Ưu tiên gán theo: tiêu đề slide, từ khóa slide, các câu chuyển đoạn (“tiếp theo”, “slide này”, “chỗ này”, tên mục giống slide), hoặc nội dung trùng rõ rệt.

**Pass B (lấp đầy phần còn lại để không sót)**

* Với các timestamp chưa gán rõ: gán vào slide gần nhất hợp lý theo ngữ cảnh và độ tương đồng từ khóa. **QUAN TRỌNG**: Khi đánh giá độ tương đồng, hãy xét cả văn bản trích xuất từ slide VÀ nội dung trong khối \`[IMAGE ANALYSIS] to [/IMAGE ANALYSIS]\` vì nó chứa mô tả trực quan của slide.
* Nếu vẫn mơ hồ: vẫn phải gán (để không sót) và gắn cờ \`MAP_UNCERTAIN\`.

#### Bước 1.4: Đóng gói chunk theo slide (chunk packaging)

Tạo danh sách chunk theo thứ tự xuất hiện:

* \`CHUNK_k\`

  * \`Slide_Range\`: ví dụ \`Slide 3–4\` hoặc \`Slide 7\`
  * \`Slide_Refs\`: trích \`Slide_Text_Raw\` và tóm tắt \`Slide_Image_Analysis\` (có thể rút gọn bằng cách chỉ giữ tiêu đề + gạch đầu dòng chính, nhưng **không được thêm ý mới**)
  * \`Timestamps_Included\`: danh sách \`TS\` thuộc chunk theo thứ tự
  * \`Script_Raw_Block\`: ghép nguyên văn các \`Script_Raw_i\` theo đúng thứ tự timestamp (không sửa chữ)

#### Bước 1.5: Kiểm tra toàn vẹn bắt buộc (coverage + duplication check)

Thực hiện và báo cáo rõ ràng các kiểm tra sau (PASS/FAIL):

1. **Coverage**: số timestamp đã gán vào chunk phải đúng bằng \`TOTAL_TIMESTAMPS\`.
2. **No Missing**: không có timestamp nào trong \`TS_1 through TS_N\` bị thiếu.
3. **No Duplication**: không có timestamp nào xuất hiện ở hơn 1 chunk.
4. **Order Integrity**: thứ tự timestamp trong toàn bộ các chunk phải khớp thứ tự trong <FULL_SCRIPT>.

Nếu bất kỳ kiểm tra nào FAIL: bắt buộc tự sửa phân đoạn và chạy lại Bước 1.5 cho đến khi tất cả PASS.
Không được tối ưu tốc độ bằng cách lược bớt các timestamp về sau; phân đoạn phải quét đến TS_N và đối chiếu đủ N timestamp trước khi báo cáo.

#### Bước 1.6: DỪNG VÀ BÁO CÁO KẾT QUẢ GIAI ĐOẠN 1 (Checkpoint)

**Tại bước này, bạn phải dừng, không được tự ý chuyển sang Giai đoạn 2–3 cho đến khi người dùng đồng ý.**

**Đầu ra bắt buộc của Checkpoint (Giai đoạn 1) - CHẾ ĐỘ A**

* Một bảng Markdown “Segmentation Report” (không phải bảng kết quả cuối cùng của toàn quy trình), gồm các cột:

  * \`Chunk_ID | Slide_Range | #Timestamps | Timestamp_Start–End | Flags(OCR_UNCERTAIN/MAP_UNCERTAIN) | Notes\`
* Một dòng tóm tắt kiểm tra toàn vẹn:

  * \`TOTAL_TIMESTAMPS = N; ASSIGNED = N; MISSING = 0; DUPLICATE = 0; ORDER_OK = YES/NO\`
* Dòng hướng dẫn hành động:

  * “Nếu bạn xác nhận phân đoạn đúng, hãy trả lời: **OK SEGMENTATION** để tôi chuyển sang Giai đoạn 2–3 và xuất bảng Markdown cuối cùng theo cấu trúc đã khóa.”

### GIAI ĐOẠN 2: ĐÁNH GIÁ CHẤT LƯỢNG (Analysis)

(Chỉ thực hiện khi nhận được lệnh "OK SEGMENTATION")

**Bước 2.1: So sánh và Phân tích:** Với mỗi phân đoạn, xác định những thông tin trong script KHÔNG có trên slide (cả text và hình ảnh đã được phân tích).
**Bước 2.2: Chấm điểm theo Ma trận:**
Bạn PHẢI đánh giá mỗi đoạn script dựa trên ma trận tiêu chí sau đây:

| Tiêu chí | Mô tả | Trọng số |
| :--- | :--- | :--- |
| Mức độ Mở rộng & Làm sâu | Giải thích "tại sao", cơ chế, ví dụ ngoài slide | 30% |
| Mức độ Liên kết & Tổng hợp | Kết nối lâm sàng, ca bệnh, kiến thức liên môn | 40% |
| Mức độ Tương tác & Làm rõ | Câu hỏi tu từ, nhấn mạnh trọng tâm, đơn giản hóa | 20% |
| Dấu hiệu Suy giảm Chất lượng | Đọc nguyên văn slide, lạc đề, quá nhiều từ đệm | -10% |

**Bước 2.3: Tính toán:**
Điểm Tổng hợp = (Điểm Mở rộng * 0.3) + (Điểm Liên kết * 0.4) + (Điểm Tương tác * 0.2) + (Điểm Suy giảm * -0.1)

**Bước 2.4: Phân loại:**
*   'Chất lượng cao' (Điểm > 7.7)
*   'Trung bình' (Điểm từ 5.0 đến 7.7)
*   'Chất lượng thấp' (Điểm < 5.0)

### GIAI ĐOẠN 3: TINH CHỈNH DÒNG CHẢY (Refinement)

**Bước 3.1: Kiểm tra Điều kiện (Gatekeeping)**
*   NẾU Phân loại là 'Chất lượng cao' hoặc 'Trung bình' -> THỰC HIỆN Bước 3.2.
*   NẾU Phân loại là 'Chất lượng thấp' -> BỎ QUA, ghi "Không áp dụng".

**Bước 3.2: Thực thi Tinh chỉnh (Editing)**
Tạo phiên bản mới cho cột Script đã Tinh chỉnh theo các quy tắc:

**A. ĐƯỢỢC PHÉP:**
*   Thay thế từ nối, cụm từ chuyển tiếp.
*   Kết hợp câu đơn thành câu phức, hoặc tách câu quá dài.
*   Thay thế từ ngữ sáo rỗng bằng từ ngữ chuyên nghiệp.

**B. CẤM TUYỆT ĐỐI (Hợp đồng bảo toàn dữ liệu):**
*   TUYỆT ĐỐI KHÔNG thêm/bớt/sửa dữ liệu, con số, thuật ngữ y khoa.
*   TUYỆT ĐỐI KHÔNG thay đổi thứ tự ý.
*   TUYỆT ĐỐI KHÔNG thêm bình luận ngoại lai.
*   VỚI BẢNG MARKDOWN: TUYỆT ĐỐI KHÔNG DÙNG XUỐNG DÒNG VẬT LÝ, PHẢI DÙNG <br>.

**KẾT THÚC:** Tổng hợp toàn bộ kết quả của 3 giai đoạn vào bảng Markdown (CHẾ ĐỘ B).
`;

// ======================================================================================
// API INTERACTION LAYER
// ======================================================================================

const MAX_RETRIES = 3;

/**
 * Wraps a promise with a timeout.
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), timeoutMs);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutHandle);
      return res;
    }),
    timeoutPromise
  ]);
};

const runWithRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Wrap the API call function in a timeout
      return await withTimeout(fn(), TIMEOUT_MS);
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.toString().toLowerCase();
      
      // Handle known retryable errors
      if (errorMsg.includes('429') || errorMsg.includes('resource_exhausted')) {
        const e = new Error("RATE_LIMIT_EXCEEDED");
        (e as any).raw = error?.toString?.() ?? String(error);
        throw e;
      }
      
      // Treat timeouts as retryable network errors
      if (errorMsg.includes('request_timeout')) {
         console.warn(`Attempt ${attempt + 1} timed out.`);
         // allow retry logic to proceed
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Executes a single-turn job for the pipeline (Worker, Aggregator).
 */
export const runPipelineStep = async (payload: string, modelName: ModelName = 'gemini-2.5-flash'): Promise<string> => {
  return runWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: payload }] }],
      config: { systemInstruction: SYSTEM_PROMPT }
    });
    return response.text || '';
  });
};

/**
 * Executes the two-turn analysis for a specific chunk.
 */
export const runChunkAnalysis = async (setupPayload: string, modelName: ModelName = 'gemini-2.5-flash', isThinkingMode: boolean = false): Promise<string> => {
    return runWithRetry(async () => {
        // FIX: Always use the passed modelName, do not force override based on isThinkingMode.
        const modelToUse = modelName;
        
        const config: { systemInstruction: string, thinkingConfig?: object } = {
            systemInstruction: SYSTEM_PROMPT,
        };

        // FIX: Only apply thinking config if mode is enabled AND the model supports it (currently only gemini-3-pro-preview)
        if (isThinkingMode && modelToUse === 'gemini-3-pro-preview') {
            config.thinkingConfig = { thinkingBudget: 32768 };
        } else if (isThinkingMode) {
             console.info(`Thinking mode enabled but not applied for model ${modelToUse} (only supported on gemini-3-pro-preview).`);
        }

        const chat = ai.chats.create({
            model: modelToUse,
            config: config,
        });
        await chat.sendMessage({ message: setupPayload });
        const response = await chat.sendMessage({ message: "OK SEGMENTATION" });
        return response.text || '';
    });
};

/**
 * Analyzes a single image with a text prompt.
 */
export const analyzeImage = async (prompt: string, imagePart: Part, modelName: ModelName = 'gemini-3-pro-preview'): Promise<string> => {
    return runWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }, imagePart] },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
            ],
        });
        return response.text || '';
    });
}

/**
 * Analyzes an image of a presentation slide to extract key visual information.
 */
export const analyzeSlideImage = async (imagePart: Part, modelName: ModelName = 'gemini-3-pro-preview'): Promise<string> => {
    return runWithRetry(async () => {
        const prompt = `You are an expert medical analyst. Analyze this slide from a medical lecture. 
        Describe any images, diagrams, charts, or key text elements concisely. 
        Focus on information that would complement a spoken transcript. 
        If the slide is text-heavy, summarize the main points.
        
        SPECIAL INSTRUCTIONS FOR FLOWCHARTS/DIAGRAMS:
        If the image is a flowchart, diagram, or schematic, first analyze its structure. Identify the key components (nodes/blocks) and the relationships between them (arrows/edges). Then, describe the logical flow or process it represents in a step-by-step or structured manner. Do not just list the text in the boxes; explain the process.

        If it contains no significant visual information, output the text "No significant visual content.".
        Do not add any preamble or conclusion, just the analysis.`;
        
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }, imagePart] },
        });
        return response.text || '';
    });
};


/**
 * Extracts the relevant script lines for a given chunk.
 */
export const extractScriptForChunk = (fullScript: string, chunk: LectureChunk): string => {
    const lines = fullScript.split('\n');
    const relevantLines: string[] = [];
    let inChunk = false;

    // Helper to normalize TS for comparison (e.g. 05:00 -> 5:00)
    const normalizeTs = (ts: string) => ts.replace(/[\[\]]/g, '').replace(/^0+/, '');

    // Create a Set of normalized timestamps for O(1) lookup
    const chunkTsSet = new Set(chunk.tsList.map(normalizeTs));

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Extract TS from line if present
        const match = trimmedLine.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
        
        if (match) {
            const lineTs = normalizeTs(match[1]);
            if (chunkTsSet.has(lineTs)) {
                inChunk = true;
                relevantLines.push(line);
            } else {
                // If we hit a timestamp NOT in our set, and we were inside the chunk,
                // it means we've passed the end of this chunk.
                if (inChunk) {
                    break;
                }
            }
        } else if (inChunk) {
            // Continuation text within a chunk
            relevantLines.push(line);
        }
    }
    return relevantLines.join('\n');
}

/**
 * Extracts relevant slide content for a given chunk.
 */
export const extractSlidesForChunk = (fullSlideContent: string, chunk: LectureChunk): string => {
    const slideRangeMatch = chunk.slideRange.match(/(\d+)-(\d+)/) || chunk.slideRange.match(/(\d+)/);
    if (!slideRangeMatch) return "Slide content for this range could not be determined.";

    const startSlide = parseInt(slideRangeMatch[1], 10);
    const endSlide = parseInt(slideRangeMatch[2] || slideRangeMatch[1], 10);

    const slides = fullSlideContent.split('--- SLIDE ');
    const relevantSlides: string[] = [];

    for (let i = startSlide; i <= endSlide; i++) {
        const slide = slides.find(s => s.startsWith(`${i} ---`));
        if (slide) {
            relevantSlides.push(`--- SLIDE ${slide}`);
        }
    }

    return relevantSlides.join('\n\n');
}