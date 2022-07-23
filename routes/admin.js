const path = require("path");
const { check } = require("express-validator");
const express = require("express");

const adminController = require("../controllers/admin");
const isAuth = require("../middleware/is-auth");

const router = express.Router();

// /admin/add-product => GET
router.get("/add-product", isAuth, adminController.getAddProduct);

// /admin/products => GET
router.get("/products", isAuth, adminController.getProducts);

// /admin/add-product => POST
router.post(
  "/add-product",
  isAuth,
  [
    check("title", "Title cannot be empty.").notEmpty().trim(),
    // check("imageUrl", "Image must be a URL.").isURL().trim(),
    check("price", "Price must be a number.").isNumeric().trim(),
    check(
      "description",
      "Description must be minimum 5 characters and maximum 400 characters."
    )
      .isLength({ min: 5, max: 400 })
      .trim(),
  ],
  adminController.postAddProduct
);

router.get("/edit-product/:productId", isAuth, adminController.getEditProduct);

router.post(
  "/edit-product",
  isAuth,
  [
    check("title", "Title cannot be empty.").notEmpty().trim(),
    check("price", "Price must be a number.").isNumeric().trim(),
    check(
      "description",
      "Description must be minimum 5 characters and maximum 400 characters."
    )
      .isLength({ min: 5, max: 400 })
      .trim(),
  ],
  adminController.postEditProduct
);

router.delete("/product/:productId", isAuth, adminController.deleteProduct);

module.exports = router;
