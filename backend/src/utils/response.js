// src/utils/response.js
// Equivalen helper response di Laravel kayak: return response()->json(...)

const response = {
  // Sukses — kayak return response()->json(['status' => 'success', 'data' => $data])
  success: (res, data, message = "OK", statusCode = 200) => {
    return res.status(statusCode).json({
      status: "success",
      message,
      data,
    });
  },

  // Error — kayak return response()->json(['status' => 'error'], 500)
  error: (res, message = "Internal Server Error", statusCode = 500) => {
    return res.status(statusCode).json({
      status: "error",
      message,
      data: null,
    });
  },

  // Not found — kayak abort(404)
  notFound: (res, message = "Data tidak ditemukan") => {
    return res.status(404).json({
      status: "error",
      message,
      data: null,
    });
  },
};

module.exports = response;
