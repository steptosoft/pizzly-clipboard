import { NextFunction, Response, Request } from 'express'

export const verifyToken = (req: Request , res: Response, next: NextFunction) => {
    let request = require('request-promise');
    let url = process.env.VERIFY_TOKEN_URL;
    console.log("url-->",url);
    
    //Obviously replace this with your token
    let myToken=req.headers["authorization"]
      if(myToken?.startsWith('Bearer ')){
        myToken = myToken.slice(7, myToken.length)
      }
    // let myToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6ImJkWmVtcVhQVk13b1pjY1dJRmhQMFEiLCJ0eXAiOiJhdCtqd3QifQ.eyJuYmYiOjE2MjQ1MzY1ODcsImV4cCI6MTYyNDU0MDE4NywiaXNzIjoiaHR0cHM6Ly9hcHAtY2xpcGJpYXBpYmFja2VuZC1wcm9kLmF6dXJld2Vic2l0ZXMubmV0L2lkZW50aXR5LXNlcnZlciIsImNsaWVudF9pZCI6ImNsaXBiaS1mcm9udGVuZCIsInN1YiI6IjYwZDA4MmNmMTg3NGRiYWY2NGJkODM0NyIsImF1dGhfdGltZSI6MTYyNDUzNjU4NywiaWRwIjoiRXh0ZXJuYWxPaWRjIiwiZW1haWwiOiJhc2hyYWZAY2FwaXRhbG51bWJlcnMuY29tIiwianRpIjoiQUJGNzczMzFDQUFCQTc5QzUwQzE0NkYwNDc4OUNFRTIiLCJzaWQiOiI0REYyQ0Q1MDg2MzZCMERFNTM3MEM4QTA2RjIyQzgwRSIsImlhdCI6MTYyNDUzNjU4Nywic2NvcGUiOlsiY2xpcGJpLWFwaSIsIm9wZW5pZCIsInByb2ZpbGUiLCJlbWFpbCIsImNsaXBiaS1wcm9maWxlIiwicm9sZSIsInBlcm1pc3Npb25zIl0sImFtciI6WyJleHRlcm5hbCJdfQ.fEjWwCRAMHfga8AwrYbq7RQ3dYtPovQ-20d1gdM37OI2ytRvGlt3wtUYzX5k3Joer7UOUMbCAlSIZev5vsLutPaYjtopJW5JJ8a0Ql4ZCu99zrzmGl8SKfz-iw_4lIFmm_Dba4FaF8gRW0O9DoaYBYs_bEhCTz8kES9p2xdkCHIBa8f9hI6Lu_AB-ed-LcVyO92e7xi0ZiMAjYLqML4Fz8KP_FuQphBxjyC2FlS58A3KQVsCAvtj3FnHKpMWvcqY8DvUFj9s5IxzONmN69kZQDRAxdALulzNTmhdXL2M_XPeGyBymQWdR9B3rl-FP1_QIUJMtCtmITrkwAiWyZjwHw`;
    request.get(url, {
      headers: {
        Authorization: `Bearer ${myToken}`
      }
    }).then((res1)=> {
        next();
     }).catch((err) => {
      console.log("err",err);
      return res.status(401).json({
        message: 'user is not authorized'
      })
      
    });
}
