import { httpActionGeneric, httpRouter } from "convex/server";

import { handleSchemaReviewRequest, reviewSchemaWithGemini } from "./schemaReview";

const http = httpRouter();

http.route({
  path: "/schema/review",
  method: "POST",
  handler: httpActionGeneric(async (_ctx, request) => {
    return handleSchemaReviewRequest(request, {
      reviewSchema: reviewSchemaWithGemini
    });
  })
});

export default http;
