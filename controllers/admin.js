const { validationResult } = require("express-validator");

const cloudinary = require("../util/cloudinary");
const Product = require("../models/product");

exports.getAddProduct = (req, res, next) => {
  res.render("admin/edit-product", {
    pageTitle: "Add Product",
    path: "/admin/add-product",
    editing: false,
    hasError: false,
    errorMessage: null,
    validationErrors: [],
  });
};

exports.postAddProduct = async (req, res, next) => {
  const title = req.body.title;
  const image = req.body.image;
  const price = req.body.price;
  const description = req.body.description;
  if (!image) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: false,
      hasError: true,
      errorMessage: "Attached file is not an image",
      product: {
        title: title,
        price: price,
        description: description,
      },
      validationErrors: [],
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: false,
      hasError: true,
      errorMessage: errors.array()[0].msg,
      product: {
        title: title,
        imageUrl: image,
        price: price,
        description: description,
      },
      validationErrors: errors.array(),
    });
  }
  const imageBase64 = image;
  try {
    const uploadedResponse = await cloudinary.uploader.upload(imageBase64, {
      upload_preset: "dev_setups",
    });
    const product = new Product({
      title: title,
      price: price,
      description: description,
      imageUrl: uploadedResponse.url,
      userId: req.user,
    });
    await product.save();
    console.log("Created Product");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

exports.getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;
  if (!editMode) {
    return res.redirect("/");
  }
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if (!product) {
        return res.redirect("/");
      }
      res.render("admin/edit-product", {
        pageTitle: "Edit Product",
        path: "/admin/edit-product",
        editing: editMode,
        product: product,
        errorMessage: null,
        validationErrors: [],
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postEditProduct = async (req, res, next) => {
  const prodId = req.body.productId;
  const updatedTitle = req.body.title;
  const updatedPrice = req.body.price;
  const image = req.body.image;
  const updatedDesc = req.body.description;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render("admin/edit-product", {
      pageTitle: "Add Product",
      path: "/admin/add-product",
      editing: true,
      hasError: true,
      errorMessage: errors.array()[0].msg,
      product: {
        title: updatedTitle,
        price: updatedPrice,
        description: updatedDesc,
        _id: prodId,
      },
      validationErrors: errors.array(),
    });
  }
  try {
    const product = await Product.findById(prodId);
    if (product.userId.toString() !== req.user._id.toString()) {
      return res.redirect("/");
    }
    product.title = updatedTitle;
    product.price = updatedPrice;
    product.description = updatedDesc;
    if (image) {
      // Delete the old file
      // the URL: https://res.cloudinary.com/djhbfnaz0/image/upload/v1658323985/tycxbzk2yckn8cwyn0j7.png
      let public_id = product.imageUrl.split("/");
      public_id = public_id[public_id.length - 1].split(".")[0];
      await cloudinary.uploader.destroy(public_id, function (result) {
        console.log(result);
      });
      // Upload new file
      const uploadedResponse = await cloudinary.uploader.upload(image, {
        upload_preset: "dev_setups",
      });
      product.imageUrl = uploadedResponse.url;
    }

    await product.save();
    console.log("UPDATED PRODUCT!");
    res.redirect("/admin/products");
  } catch (err) {
    console.log(err);
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};

exports.getProducts = (req, res, next) => {
  Product.find({ userId: req.user._id })
    // .select('title price -_id')
    // .populate('userId', 'name')
    .then((products) => {
      res.render("admin/products", {
        prods: products,
        pageTitle: "Admin Products",
        path: "/admin/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.deleteProduct = async (req, res, next) => {
  const prodId = req.params.productId;
  try {
    const product = await Product.findById(prodId);
    if (!product) {
      return next(new Error("Product not found."));
    }
    // Delete product file
    // the URL: https://res.cloudinary.com/djhbfnaz0/image/upload/v1658323985/tycxbzk2yckn8cwyn0j7.png
    let public_id = product.imageUrl.split("/");
    public_id = public_id[public_id.length - 1].split(".")[0];
    await cloudinary.uploader.destroy(public_id, function (result) {
      console.log(result);
    });
    
    await Product.deleteOne({ _id: prodId, userId: req.user._id });
    console.log("DESTROYED PRODUCT");
    res.status(200).json({ message: "Success!" });
  } catch (err) {
    res.status(500).json({ message: "Deleting product failed." });
  }
};
