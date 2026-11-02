/**
 * StockWise / MFEF - Dashboard Controller (PostgreSQL)
 * Preserves exact API contract for /api/dashboard
 */

const dashboardRepository = require('../repositories/dashboardRepository');

// @desc    Get live dashboard metrics, charts, and recent activity
// @route   GET /api/dashboard
// @access  Private
const getDashboardMetrics = async (req, res, next) => {
  try {
    const { timeRange = '30d' } = req.query;

    const data = await dashboardRepository.getDashboardMetrics({ timeRange });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardMetrics
};
