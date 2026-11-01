const { getRestockRecommendations } = require('../services/restockService');

// @desc    Get explainable restock intelligence recommendations
// @route   GET /api/restock
// @access  Private
const getRecommendations = async (req, res, next) => {
  try {
    const {
      windowDays = 30,
      leadTimeDays = 7,
      safetyStockDays = 3,
      category = '',
      supplierId = ''
    } = req.query;

    const result = await getRestockRecommendations({
      windowDays: parseInt(windowDays, 10) || 30,
      leadTimeDays: parseInt(leadTimeDays, 10) || 7,
      safetyStockDays: parseInt(safetyStockDays, 10) || 3,
      category: category || null,
      supplierId: supplierId || null
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRecommendations
};

