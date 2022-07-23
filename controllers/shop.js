const path = require("path");

const PDFDocument = require("pdfkit");
const stripe = require("stripe")(process.env.STRIPE_KEY);
const S3 = require("aws-sdk/clients/s3");

const Product = require("../models/product");
const Order = require("../models/order");

const ITEMS_PER_PAGE = 4;

exports.getProducts = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;
  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      res.render("shop/product-list", {
        prods: products,
        pageTitle: "Products",
        path: "/products",
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPrevious: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      res.render("shop/product-detail", {
        product: product,
        pageTitle: product.title,
        path: "/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;
  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      res.render("shop/index", {
        prods: products,
        pageTitle: "Shop",
        path: "/",
        currentPage: page,
        hasNextPage: ITEMS_PER_PAGE * page < totalItems,
        hasPrevious: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      let products = user.cart.items;

      let isUpToDate = true;
      const updatedProducts = products.filter((p) => {
        if (p.productId !== null) {
          return p.productId !== null;
        } else {
          isUpToDate = false;
        }
      });
      if (!isUpToDate) {
        req.user.cart.items = updatedProducts;
        req.session.user.cart.items = updatedProducts;
        products = updatedProducts;
        req.session.save();
        req.user.save();
      }

      res.render("shop/cart", {
        path: "/cart",
        pageTitle: "Your Cart",
        products: products,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => {
      return req.user.addToCart(product);
    })
    .then((result) => {
      console.log(result);
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products;
  let total = 0;
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      products = user.cart.items;

      let isUpToDate = true;
      total = 0;
      const updatedProducts = products.filter((p) => {
        if (p.productId !== null) {
          total += p.quantity * p.productId.price;
          return p.productId !== null;
        } else {
          isUpToDate = false;
        }
      });
      if (!isUpToDate) {
        req.user.cart.items = updatedProducts;
        req.session.user.cart.items = updatedProducts;
        products = updatedProducts;
        req.session.save();
        req.user.save();
      }

      return stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: user.cart.items.map((p) => {
          return {
            name: p.productId.title,
            description: p.productId.description,
            amount: p.productId.price * 100,
            currency: "usd",
            quantity: p.quantity,
          };
        }),
        success_url:
          req.protocol + "://" + req.get("host") + "/checkout/success",
        cancel_url: req.protocol + "://" + req.get("host") + "/checkout/cancel",
      });
    })
    .then((session) => {
      res.render("shop/checkout", {
        path: "/checkout",
        pageTitle: "Checkout",
        products: products,
        totalSum: total,
        sessionId: session.id,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckoutSuccess = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
        },
        products: products,
      });
      return order.save();
    })
    .then((result) => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect("/orders");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ "user.userId": req.user._id })
    .then((orders) => {
      res.render("shop/orders", {
        path: "/orders",
        pageTitle: "Your Orders",
        orders: orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = async (req, res, next) => {
  const orderId = req.params.orderId;
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new Error("No Order found."));
    }
    if (order.user.userId.toString() !== req.user._id.toString()) {
      return next(new Error("Unauthorized."));
    }

    const invoiceName = "invoice-" + orderId + ".pdf";
    const invoicePath = path.join(
      "data",
      "invoices",
      "invoice-62d2dce5107d704234d53542.pdf"
    );

    const bucketName = process.env.AWS_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    const s3 = new S3({
      region,
      accessKeyId,
      secretAccessKey,
    });

    const pdfDoc = new PDFDocument();
    pdfDoc.text("----------------------");
    let totalPrice = 0;
    order.products.forEach((prod) => {
      totalPrice += prod.quantity * prod.product.price;
      pdfDoc
        .fontSize(14)
        .text(
          prod.product.title +
            " - " +
            prod.quantity +
            " x " +
            "$" +
            prod.product.price
        );
    });
    pdfDoc.text("---");
    pdfDoc.fontSize(20).text("Total Price: $" + totalPrice);
    pdfDoc.end();

    const uploadParams = {
      Bucket: bucketName,
      Body: pdfDoc,
      Key: invoiceName,
    };
    const uploadResult = await s3.upload(uploadParams).promise();

    const downloadParams = {
      Key: uploadResult.Key,
      Bucket: bucketName,
    };
    const downloadResult = s3.getObject(downloadParams).createReadStream();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${invoiceName}`);
    downloadResult.pipe(res);
  } catch (err) {
    next(err);
  }
  // const pdfDoc = new PDFDocument();
  // res.setHeader("Content-Type", "application/pdf");
  // // inline for just display pdf AND attachment for straight download pdf
  // res.setHeader("Content-Disposition", `inline; filename='${invoiceName}'`);
  // pdfDoc.pipe(fs.createWriteStream(invoicePath));
  // pdfDoc.pipe(res);

  // pdfDoc.fontSize(26).text("Invoice", {
  //   underline: true,
  // });

  // pdfDoc.text("----------------------");
  // let totalPrice = 0;
  // order.products.forEach((prod) => {
  //   totalPrice += prod.quantity * prod.product.price;
  //   pdfDoc
  //     .fontSize(14)
  //     .text(
  //       prod.product.title +
  //         " - " +
  //         prod.quantity +
  //         " x " +
  //         "$" +
  //         prod.product.price
  //     );
  // });
  // pdfDoc.text("---");
  // pdfDoc.fontSize(20).text("Total Price: $" + totalPrice);

  // pdfDoc.end();
  // Preloading data: (a bad way for downloading big file - since it can cause memory overflow)
  // fs.readFile(invoicePath, (err, data) => {
  //   if (err) {
  //     return next(err);
  //   }
  //   res.setHeader("Content-Type", "application/pdf");
  //   // inline for just display pdf AND attachment for straight download pdf
  //   res.setHeader("Content-Disposition", `inline; filename=${invoiceName}`);
  //   res.send(data);
  // });

  // Steaming data: a good way for downloading big file.
  // const file = fs.createReadStream(invoicePath);
  // res.setHeader("Content-Type", "application/pdf");
  // // inline for just display pdf AND attachment for straight download pdf
  // res.setHeader("Content-Disposition", `inline; filename=${invoiceName}`);
  // file.pipe(res);
};
